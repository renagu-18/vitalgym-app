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

export async function createMeasurement(clientId: string, data: {
  measured_at: string
  weight_kg: number | null
  height_cm: number | null
  body_fat_pct: number | null
  waist_cm: number | null
  hip_cm: number | null
  chest_cm: number | null
  arms_cm: number | null
  legs_cm: number | null
  notes: string | null
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: insertErr } = await supabase.from('measurements').insert({
    client_id: clientId,
    ...data,
  })

  if (insertErr) return { error: insertErr.message }
  revalidatePath(`/admin/measurements/${clientId}`)
  return { success: true }
}

export async function deleteMeasurement(id: string, clientId: string) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: deleteErr } = await supabase
    .from('measurements')
    .delete()
    .eq('id', id)

  if (deleteErr) return { error: deleteErr.message }
  revalidatePath(`/admin/measurements/${clientId}`)
  return { success: true }
}
