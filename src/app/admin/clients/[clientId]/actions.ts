'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
  endDate: string
  classesRemaining: number
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  // Desactivar suscripción anterior
  await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('client_id', data.clientId)
    .eq('status', 'active')

  const { error: insertErr } = await supabase.from('subscriptions').insert({
    client_id: data.clientId,
    plan_id: data.planId,
    start_date: data.startDate,
    end_date: data.endDate,
    classes_remaining: data.classesRemaining,
    status: 'active',
  })

  if (insertErr) return { error: insertErr.message }
  revalidatePath(`/admin/clients/${data.clientId}`)
  return { success: true }
}

export async function updateSubscription(subId: string, clientId: string, data: {
  classesRemaining: number
  status: 'active' | 'paused' | 'expired'
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: updateErr } = await supabase
    .from('subscriptions')
    .update({ classes_remaining: data.classesRemaining, status: data.status })
    .eq('id', subId)

  if (updateErr) return { error: updateErr.message }
  revalidatePath(`/admin/clients/${clientId}`)
  return { success: true }
}
