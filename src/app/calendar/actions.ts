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

  if (block.current_count >= block.max_capacity) return { error: 'Este bloque ya no tiene cupos disponibles' }

  if (!sub || sub.classes_remaining <= 0) return { error: 'No tienes clases disponibles en tu suscripción' }

  const isUnlimited = sub.classes_remaining >= 9999

  // Reclama la clase de forma atómica antes de insertar la reserva (vía RPC porque el
  // cliente no tiene permiso de UPDATE directo sobre subscriptions bajo RLS). El descuento
  // ocurre en una sola sentencia SQL en la base de datos, así que dos solicitudes concurrentes
  // (doble clic, reintento de red) no pueden ambas pasar con el mismo cupo disponible.
  if (!isUnlimited) {
    const { data: claimed, error: claimError } = await supabase
      .rpc('adjust_my_subscription_classes', { p_subscription_id: sub.id, p_delta: -1 })

    if (claimError || !claimed) {
      return { error: 'No tienes clases disponibles en tu suscripción' }
    }
  }

  const { error: insertError } = await supabase
    .from('bookings')
    .insert({
      client_id: user.id,
      time_block_id: timeBlockId,
      status: 'approved',
      notified_at: new Date().toISOString(),
    })

  if (insertError) {
    // La reserva no se pudo crear pero ya habíamos reclamado la clase: revertir el descuento.
    if (!isUnlimited) {
      await supabase.rpc('adjust_my_subscription_classes', { p_subscription_id: sub.id, p_delta: 1 })
    }
    if (insertError.code === '23505') return { error: 'Ya tienes una reserva para este horario' }
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

  // Si estaba aprobada, devolver la clase al contador (misma RPC atómica que requestBooking)
  if (booking.status === 'approved') {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, classes_remaining')
      .eq('client_id', user.id)
      .eq('status', 'active')
      .single()

    if (sub && sub.classes_remaining < 9999) {
      await supabase.rpc('adjust_my_subscription_classes', { p_subscription_id: sub.id, p_delta: 1 })
    }
  }

  revalidatePath('/calendar')
  return { success: true }
}
