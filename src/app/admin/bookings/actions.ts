'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendBookingWebhook, formatBlockTime } from '@/lib/webhooks'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'No autenticado' as string }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { supabase: null, error: 'No autorizado' as string }
  return { supabase, error: null }
}

export async function approveBooking(bookingId: string) {
  const { supabase, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }

  // Obtener reserva con datos del cliente y bloque
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      *,
      client:profiles!bookings_client_id_fkey(full_name, email, phone, notify_via),
      time_block:time_blocks!bookings_time_block_id_fkey(start_time, end_time, current_count, max_capacity)
    `)
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Reserva no encontrada' }
  if (booking.status !== 'pending') return { error: 'La reserva ya fue procesada' }

  const block = booking.time_block as {
    start_time: string; end_time: string; current_count: number; max_capacity: number
  } | null

  if (!block) return { error: 'Bloque no encontrado' }
  if (block.current_count >= block.max_capacity) return { error: 'El bloque ya está lleno' }

  // Aprobar reserva
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'approved', notified_at: new Date().toISOString() })
    .eq('id', bookingId)

  if (updateError) return { error: 'Error al aprobar la reserva' }

  // Ya no se descuenta la clase acá: aprobar solo confirma el cupo. El descuento ocurre
  // recién cuando la clase se completa (completeBooking, o automáticamente cuando pasa
  // start_time vía complete_past_bookings).

  // Webhook a n8n
  const client = booking.client as {
    full_name: string; email: string | null; phone: string | null; notify_via: 'whatsapp' | 'gmail'
  } | null

  if (client) {
    const { date, time } = formatBlockTime(block.start_time, block.end_time)
    await sendBookingWebhook({
      event: 'booking_approved',
      client_name: client.full_name,
      client_email: client.email ?? '',
      client_phone: client.phone,
      notify_via: client.notify_via,
      booking_date: date,
      booking_time: time,
    })
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/admin')
  return { success: true }
}

export async function rejectBooking(bookingId: string, reason?: string) {
  const { supabase, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      *,
      client:profiles!bookings_client_id_fkey(full_name, email, phone, notify_via),
      time_block:time_blocks!bookings_time_block_id_fkey(start_time, end_time)
    `)
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Reserva no encontrada' }
  if (booking.status !== 'pending') return { error: 'La reserva ya fue procesada' }

  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'rejected',
      rejection_reason: reason ?? null,
      notified_at: new Date().toISOString(),
    })
    .eq('id', bookingId)

  if (updateError) return { error: 'Error al rechazar la reserva' }

  // Webhook a n8n
  const client = booking.client as {
    full_name: string; email: string | null; phone: string | null; notify_via: 'whatsapp' | 'gmail'
  } | null
  const block = booking.time_block as { start_time: string; end_time: string } | null

  if (client && block) {
    const { date, time } = formatBlockTime(block.start_time, block.end_time)
    await sendBookingWebhook({
      event: 'booking_rejected',
      client_name: client.full_name,
      client_email: client.email ?? '',
      client_phone: client.phone,
      notify_via: client.notify_via,
      booking_date: date,
      booking_time: time,
      rejection_reason: reason,
    })
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/admin')
  return { success: true }
}

// Marca una reserva aprobada como completada (la clase ya se dictó) y recién en ese momento
// descuenta 1 clase de la suscripción activa del cliente. Es el mismo descuento que aplica
// automáticamente complete_past_bookings() cuando pasa start_time; esta es la versión manual
// para cuando el admin quiere completarla antes de que corra el cron.
export async function completeBooking(bookingId: string) {
  const { supabase, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }

  // Update con guard: solo transiciona si sigue 'approved', para no descontar dos veces
  // si se hace doble clic o la reserva ya fue completada por el cron mientras tanto.
  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'approved')
    .select('client_id')

  if (updateError) return { error: 'Error al completar la reserva' }
  if (!updated || updated.length === 0) return { error: 'La reserva no está aprobada o ya fue procesada' }

  const clientId = updated[0].client_id

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, classes_remaining')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle()

  if (sub && sub.classes_remaining > 0 && sub.classes_remaining < 9999) {
    await supabase
      .from('subscriptions')
      .update({ classes_remaining: sub.classes_remaining - 1 })
      .eq('id', sub.id)
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/admin')
  return { success: true }
}
