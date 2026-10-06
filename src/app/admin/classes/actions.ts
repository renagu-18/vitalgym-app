'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ADJUSTMENT_REASONS, type AdjustmentReason, type RefundReason } from '@/lib/class-adjustments'

// Acciones del admin sobre asistencia y saldo de clases. El saldo NO se toca directamente: se
// deriva de los estados de bookings y de class_adjustments (vista subscription_class_balance),
// así que acá solo se cambia un estado o se inserta un ajuste.

const TZ = 'America/Santiago'


async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, userId: null, error: 'No autenticado' as string }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { supabase: null, userId: null, error: 'No autorizado' as string }
  return { supabase, userId: user.id, error: null }
}

function revalidateAll(clientId?: string) {
  revalidatePath('/admin')
  revalidatePath('/admin/bookings')
  if (clientId) revalidatePath(`/admin/clients/${clientId}`)
}

function santiagoDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

// Marca la reserva como 'no_show' (descuenta la clase) o la devuelve a asistida ('present'):
// 'completed' si la clase ya empezó, 'approved' si todavía no (para que el cron la procese).
// Sirve igual si el cron ya la había pasado a 'completed' (completed <-> no_show).
export async function setBookingAttendance(bookingId: string, target: 'no_show' | 'present') {
  const { supabase, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, client_id, status, time_blocks(start_time)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Reserva no encontrada' }
  if (!['approved', 'completed', 'no_show'].includes(booking.status)) {
    return { error: 'Esta reserva no se puede marcar (no está confirmada)' }
  }

  const block = Array.isArray(booking.time_blocks) ? booking.time_blocks[0] : booking.time_blocks
  const started = block ? new Date(block.start_time).getTime() <= Date.now() : true
  const newStatus = target === 'no_show' ? 'no_show' : started ? 'completed' : 'approved'

  if (booking.status === newStatus) return { success: true, status: newStatus }

  const { error } = await supabase
    .from('bookings')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', booking.status) // guard: nadie la cambió en el medio

  if (error) return { error: 'No se pudo actualizar la reserva' }

  revalidateAll(booking.client_id)
  return { success: true, status: newStatus }
}

// Devuelve 1 clase por una reserva que descontó (no_show o cancelada tarde) insertando un ajuste
// +1 ligado a la reserva, SIN cambiar su estado. Se asigna a la suscripción en cuyo rango cae la
// fecha de la clase (la misma que la contó), no necesariamente la vigente hoy.
export async function returnClass(bookingId: string, reason: RefundReason) {
  const { supabase, userId, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }
  if (reason !== 'reagendada' && reason !== 'excepción') return { error: 'Motivo inválido' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, client_id, status, late_cancel, time_blocks(start_time)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Reserva no encontrada' }
  const descontó = booking.status === 'no_show' || (booking.status === 'cancelled' && booking.late_cancel)
  if (!descontó) return { error: 'Solo se devuelve una clase de reservas no_show o canceladas tarde' }

  // Una sola devolución por reserva: cualquier ajuste positivo ya ligado a ella cuenta.
  const { data: existing } = await supabase
    .from('class_adjustments')
    .select('id')
    .eq('booking_id', bookingId)
    .gt('quantity', 0)
    .limit(1)
  if (existing && existing.length > 0) return { error: 'Esta clase ya fue devuelta' }

  const block = Array.isArray(booking.time_blocks) ? booking.time_blocks[0] : booking.time_blocks
  if (!block) return { error: 'Bloque no encontrado' }
  const classDay = santiagoDay(block.start_time)

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('id, start_date, end_date, created_at')
    .eq('client_id', booking.client_id)
    .lte('start_date', classDay)
    .gt('end_date', classDay)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
  const sub = subs?.[0]
  if (!sub) return { error: 'No hay una suscripción que cubra la fecha de esa clase' }

  const { error } = await supabase.from('class_adjustments').insert({
    subscription_id: sub.id,
    quantity: 1,
    reason,
    booking_id: bookingId,
    created_by: userId,
  })
  if (error) return { error: 'No se pudo registrar la devolución' }

  revalidateAll(booking.client_id)
  return { success: true }
}

// Suma (o resta, si es negativa) clases a la suscripción vigente del cliente.
export async function addClassAdjustment(data: {
  clientId: string
  quantity: number
  reason: AdjustmentReason
  note?: string
}) {
  const { supabase, userId, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }

  if (!Number.isInteger(data.quantity) || data.quantity === 0) return { error: 'La cantidad debe ser un entero distinto de 0' }
  if (Math.abs(data.quantity) > 50) return { error: 'La cantidad máxima por ajuste es 50' }
  if (!ADJUSTMENT_REASONS.includes(data.reason)) return { error: 'Motivo inválido' }
  const note = data.note?.trim() ?? ''
  if (data.reason === 'otro' && !note) return { error: 'Con el motivo "otro" escribe una nota' }

  const { data: current } = await supabase
    .from('subscription_class_balance')
    .select('subscription_id, balance, is_unlimited')
    .eq('client_id', data.clientId)
    .eq('is_current', true)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!current) return { error: 'El cliente no tiene una suscripción vigente' }
  if (current.is_unlimited) return { error: 'El plan es ilimitado: no usa ajustes de clases' }
  if (data.quantity < 0 && (current.balance ?? 0) + data.quantity < 0) {
    return { error: `El saldo quedaría negativo (hoy tiene ${current.balance})` }
  }

  // class_adjustments no tiene columna de nota: va junto al motivo ("cortesía — por la lluvia").
  const { error } = await supabase.from('class_adjustments').insert({
    subscription_id: current.subscription_id,
    quantity: data.quantity,
    reason: note ? `${data.reason} — ${note}` : data.reason,
    created_by: userId,
  })
  if (error) return { error: 'No se pudo registrar el ajuste' }

  revalidateAll(data.clientId)
  return { success: true }
}
