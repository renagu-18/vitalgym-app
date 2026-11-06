'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { RULES_VERSION } from '@/lib/rules'

// Registra que el cliente autenticado aceptó el reglamento vigente. No recibe un id de usuario:
// accept_rules() usa auth.uid() de la sesión, así que solo puede tocar la fila propia, y la fecha
// la pone la base (now()).
export async function acceptRules() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a ingresar.' }

  const { error } = await supabase.rpc('accept_rules', { p_version: RULES_VERSION })
  if (error) return { error: 'No pudimos guardar tu aceptación. Intenta de nuevo.' }

  revalidatePath('/dashboard')
  return { success: true }
}
