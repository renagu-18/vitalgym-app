'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Correo o contraseña incorrectos.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  revalidatePath('/', 'layout')
  redirect(profile?.role === 'admin' ? '/admin' : '/dashboard')
}

export async function register(formData: FormData) {
  const supabase = await createClient()

  const full_name = formData.get('full_name') as string
  const email     = formData.get('email') as string
  const phone     = formData.get('phone') as string
  const password  = formData.get('password') as string
  const notify_via = formData.get('notify_via') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, phone, notify_via },
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Este correo ya está registrado.' }
    }
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
