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

export async function createPayment(data: {
  clientId: string
  subscriptionId: string
  amount: number
  month: string
  notes: string | null
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: insertErr } = await supabase.from('payments').insert({
    client_id: data.clientId,
    subscription_id: data.subscriptionId,
    amount: data.amount,
    month: data.month,
    status: 'pending',
    notes: data.notes,
  })

  if (insertErr) return { error: insertErr.message }
  revalidatePath('/admin/payments')
  return { success: true }
}

export async function markPaymentPaid(paymentId: string) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: updateErr } = await supabase
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', paymentId)

  if (updateErr) return { error: updateErr.message }
  revalidatePath('/admin/payments')
  return { success: true }
}

export async function markPaymentOverdue(paymentId: string) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: updateErr } = await supabase
    .from('payments')
    .update({ status: 'overdue', paid_at: null })
    .eq('id', paymentId)

  if (updateErr) return { error: updateErr.message }
  revalidatePath('/admin/payments')
  return { success: true }
}

export async function deletePayment(paymentId: string) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: deleteErr } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId)

  if (deleteErr) return { error: deleteErr.message }
  revalidatePath('/admin/payments')
  return { success: true }
}
