'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'No autenticado' as string }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { supabase: null, error: 'No autorizado' as string }
  return { supabase, error: null }
}

export async function generateBlocks(startDate: string, endDate: string) {
  const { supabase, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }

  const { data, error } = await supabase.rpc('generate_time_blocks', {
    p_start_date: startDate,
    p_end_date: endDate,
  })

  if (error) return { error: error.message }

  revalidatePath('/admin/calendar')
  return { success: true, count: data as number }
}

export async function toggleBlock(blockId: string, isActive: boolean) {
  const { supabase, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }

  const { error } = await supabase
    .from('time_blocks')
    .update({ is_active: isActive })
    .eq('id', blockId)

  if (error) return { error: error.message }
  revalidatePath('/admin/calendar')
  return { success: true }
}

export async function deleteBlock(blockId: string) {
  const { supabase, error: authError } = await verifyAdmin()
  if (!supabase) return { error: authError }

  // Solo eliminar si no tiene reservas aprobadas
  const { data: approved } = await supabase
    .from('bookings')
    .select('id')
    .eq('time_block_id', blockId)
    .eq('status', 'approved')
    .limit(1)

  if (approved && approved.length > 0) {
    return { error: 'No puedes eliminar un bloque con clases confirmadas' }
  }

  const { error } = await supabase.from('time_blocks').delete().eq('id', blockId)
  if (error) return { error: error.message }
  revalidatePath('/admin/calendar')
  return { success: true }
}
