'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
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

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  })

  // No revelamos si el correo existe o no (evita enumeración de usuarios):
  // ante un email inexistente Supabase también responde sin error.
  if (error) {
    return { error: 'No se pudo enviar el correo. Intenta nuevamente en unos minutos.' }
  }

  redirect('/forgot-password?sent=1')
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const password = formData.get('password') as string
  const passwordConfirmation = formData.get('password_confirmation') as string

  if (password !== passwordConfirmation) {
    return { error: 'Las contraseñas no coinciden.' }
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: 'No se pudo actualizar la contraseña. Solicita un nuevo enlace de recuperación.' }
  }

  // Cierra la sesión de recuperación: obliga a iniciar sesión de nuevo con la contraseña nueva.
  await supabase.auth.signOut()
  redirect('/login?reset=1')
}
