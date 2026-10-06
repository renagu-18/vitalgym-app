import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Callback del enlace "Restablecer contraseña" del correo. Solo acepta type=recovery y siempre
// termina en /reset-password (nunca en un destino tomado de la URL, para no abrir redirecciones).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type === 'recovery') {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash })

    if (!error) {
      return NextResponse.redirect(`${origin}/reset-password`)
    }
  }

  // Enlace vencido, ya usado o inválido: /forgot-password muestra el aviso y permite pedir otro.
  return NextResponse.redirect(`${origin}/forgot-password?error=1`)
}
