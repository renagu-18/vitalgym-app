'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { validateRegistrationBirthDate } from '@/lib/age'

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
  const birth_date = formData.get('birth_date') as string

  // La edad se calcula desde birth_date; acá solo se valida el rango del registro (17–60).
  const birthError = validateRegistrationBirthDate(birth_date)
  if (birthError) return { error: birthError }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, phone, notify_via, birth_date },
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

  // redirectTo debe estar en Supabase > Authentication > URL Configuration > Redirect URLs.
  // La plantilla del correo arma el enlace como {{ .RedirectTo }}?token_hash=...&type=recovery.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm`,
  })

  // Respuesta SIEMPRE igual, exista o no la cuenta y falle o no el envío: ni el mensaje ni los
  // errores (p.ej. "solo puedes pedirlo cada 60 s", que solo ocurre con cuentas reales) deben
  // revelar si el correo está registrado. El error real queda solo en el log del servidor.
  if (error) console.error('resetPasswordForEmail:', error.message)

  return { message: 'Si el correo está registrado, te enviamos un enlace para cambiar tu contraseña.' }
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
