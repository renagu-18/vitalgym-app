'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SubscriptionStatus } from '@/types/database'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'No autenticado' as string }
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin') return { supabase: null, error: 'No autorizado' as string }
  return { supabase, error: null }
}

export async function updateClientProfile(clientId: string, data: {
  full_name: string
  phone: string | null
  notify_via: 'whatsapp' | 'gmail'
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ full_name: data.full_name.trim(), phone: data.phone, notify_via: data.notify_via })
    .eq('id', clientId)

  if (updateErr) return { error: updateErr.message }
  revalidatePath(`/admin/clients/${clientId}`)
  revalidatePath('/admin/clients')
  return { success: true }
}

export async function createSubscription(data: {
  clientId: string
  planId: string
  startDate: string
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

  // end_date lo calcula el trigger subscriptions_set_end_date (start_date + 3 meses); no se
  // envía acá. Al insertar, el trigger subscriptions_generate_payments crea además los 3 pagos
  // mensuales pendientes. Las clases iniciales ya no se ingresan: salen del plan (ver
  // subscription_class_balance).
  if (data.startDate > today) {
    // Renovación con inicio futuro: queda 'scheduled' y no toca la vigente. Un trigger exige que
    // empiece cuando termina la actual o después (sin solaparse); roll_subscriptions() la activa
    // sola el día de inicio.
    const { error: insertErr } = await supabase.from('subscriptions').insert({
      client_id: data.clientId,
      plan_id: data.planId,
      start_date: data.startDate,
      status: 'scheduled',
    })
    if (insertErr) return { error: insertErr.message }
  } else {
    // Inicio hoy o antes: reemplaza a la vigente. Hay un máx. de UNA activa por cliente, así que la
    // anterior se cierra primero (sus clases sobrantes se pierden) y, si el insert falla, se reabre.
    const { data: closed } = await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('client_id', data.clientId)
      .eq('status', 'active')
      .select('id')

    const { error: insertErr } = await supabase.from('subscriptions').insert({
      client_id: data.clientId,
      plan_id: data.planId,
      start_date: data.startDate,
      status: 'active',
    })

    if (insertErr) {
      if (closed?.length) {
        await supabase.from('subscriptions').update({ status: 'active' }).in('id', closed.map(s => s.id))
      }
      return { error: insertErr.message }
    }
  }

  revalidatePath(`/admin/clients/${data.clientId}`)
  return { success: true }
}

// Rescate: una suscripción quedó 'scheduled' con inicio futuro (p.ej. se creó con una fecha de
// inicio equivocada) y el cliente ve 0 clases porque el plan aún no está vigente. La recrea con
// inicio HOY (reemplaza a la activa, si hay). Solo se permite si nunca se usó: sin pagos pagados ni
// ajustes de clases, porque al recrearla se borran sus cuotas autogeneradas.
export async function startScheduledSubscriptionNow(subId: string, clientId: string) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, client_id, plan_id, start_date, status')
    .eq('id', subId)
    .single()
  if (!sub || sub.client_id !== clientId) return { error: 'Suscripción no encontrada' }
  if (sub.status !== 'scheduled') return { error: 'Solo se puede iniciar una suscripción programada' }

  const [{ count: paid }, { count: adjustments }] = await Promise.all([
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('subscription_id', subId).eq('status', 'paid'),
    supabase.from('class_adjustments').select('id', { count: 'exact', head: true }).eq('subscription_id', subId),
  ])
  if ((paid ?? 0) > 0 || (adjustments ?? 0) > 0) {
    return { error: 'Esta suscripción ya tiene pagos pagados o ajustes: no se puede recrear' }
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

  // Se borra primero (sus cuotas sin pagar se van en cascada) para no chocar con el chequeo de
  // solapes; si el nuevo insert falla, se restaura tal cual estaba.
  const { error: delErr } = await supabase.from('subscriptions').delete().eq('id', subId)
  if (delErr) return { error: delErr.message }

  const { data: closed } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('client_id', clientId)
    .eq('status', 'active')
    .select('id')

  const { error: insertErr } = await supabase.from('subscriptions').insert({
    client_id: clientId,
    plan_id: sub.plan_id,
    start_date: today,
    status: 'active',
  })

  if (insertErr) {
    if (closed?.length) {
      await supabase.from('subscriptions').update({ status: 'active' }).in('id', closed.map(s => s.id))
    }
    await supabase.from('subscriptions').insert({
      client_id: clientId, plan_id: sub.plan_id, start_date: sub.start_date, status: 'scheduled',
    })
    return { error: insertErr.message }
  }

  revalidatePath(`/admin/clients/${clientId}`)
  revalidatePath('/admin/payments')
  return { success: true }
}

export async function updateSubscription(subId: string, clientId: string, data: {
  status: SubscriptionStatus
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: updateErr } = await supabase
    .from('subscriptions')
    .update({ status: data.status })
    .eq('id', subId)

  if (updateErr) return { error: updateErr.message }
  revalidatePath(`/admin/clients/${clientId}`)
  return { success: true }
}
