'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendBookingWebhook, formatBlockTime } from '@/lib/webhooks'

export async function requestBooking(timeBlockId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const [{ data: block }, { data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from('time_blocks')
      .select('*')
      .eq('id', timeBlockId)
      .eq('is_active', true)
      .single(),
    supabase
      .from('profiles')
      .select('full_name, email, phone, notify_via')
      .eq('id', user.id)
      .single(),
    supabase
      .from('subscriptions')
      .select('id, classes_remaining')
      .eq('client_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  if (!block) return { error: 'Bloque no encontrado o inactivo' }

  const hoursUntil = (new Date(block.start_time).getTime() - Date.now()) / (1000 * 60 * 60)
  if (hoursUntil < 12) return { error: 'Debes reservar con al menos 12 horas de anticipación' }

  // Chequeo rápido para feedback inmediato en la UI (no atómico, es solo un snapshot).
  // La validación real e infranqueable ocurre dentro de book_time_block más abajo, que
  // bloquea la fila del bloque y verifica el cupo en la misma transacción del INSERT.
  if (block.current_count >= block.max_capacity) return { error: 'Este bloque ya no tiene cupos disponibles' }

  // Bug 2: sin clases disponibles, no se puede reservar. El descuento de la clase ya NO ocurre
  // acá (ver Bug 1) — solo cuando la clase se completa (complete_past_bookings / completeBooking)
  // — pero esta validación de saldo sigue siendo necesaria para no dejar reservar con 0 clases.
  if (!sub || sub.classes_remaining <= 0) {
    return { error: 'No tienes clases disponibles en tu plan actual. Contáctanos para renovar.' }
  }

  const { error: bookError } = await supabase
    .rpc('book_time_block', { p_time_block_id: timeBlockId })

  if (bookError) {
    if (bookError.code === '23505') return { error: 'Ya tienes una reserva para este horario' }
    if (bookError.code === 'P0002') return { error: 'Este bloque ya no tiene cupos disponibles' }
    if (bookError.code === 'P0001') return { error: 'Bloque no encontrado o inactivo' }
    return { error: 'Error al crear la reserva. Intenta nuevamente.' }
  }

  if (profile) {
    const { date, time } = formatBlockTime(block.start_time, block.end_time)
    await sendBookingWebhook({
      event: 'booking_approved',
      client_name: profile.full_name,
      client_email: profile.email ?? '',
      client_phone: profile.phone,
      notify_via: profile.notify_via,
      booking_date: date,
      booking_time: time,
    })
  }

  revalidatePath('/calendar')
  return { success: true }
}

export async function cancelBooking(bookingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, time_blocks(start_time)')
    .eq('id', bookingId)
    .eq('client_id', user.id)
    .single()

  if (!booking) return { error: 'Reserva no encontrada' }
  if (!['pending', 'approved'].includes(booking.status)) return { error: 'No puedes cancelar esta reserva' }

  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', bookingId)

  if (updateError) return { error: 'Error al cancelar' }

  // Ya no hay que devolver ninguna clase: el descuento ocurre recién al completar la reserva
  // (ver Bug 1), y una reserva 'completed' no es cancelable (chequeo de arriba), así que
  // cancelar una 'pending' o 'approved' nunca implicó descuento en primer lugar.

  revalidatePath('/calendar')
  return { success: true }
}
