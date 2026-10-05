import Link from 'next/link'
import { requestPasswordReset } from '@/app/auth/actions'
import AuthForm from '@/components/auth/AuthForm'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>
}) {
  const { sent, error } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">VitalGym</h1>
          <p className="mt-2 text-sm text-gray-500">Recuperar contraseña</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {sent ? (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Revisa tu correo</h2>
              <p className="text-sm text-gray-600">
                Si el correo que ingresaste tiene una cuenta asociada, te enviamos un enlace
                para restablecer tu contraseña. Revisa también tu carpeta de spam.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">¿Olvidaste tu contraseña?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Ingresa tu correo y te enviaremos un enlace para restablecerla.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4">
                  <p className="text-sm text-red-700">
                    El enlace no es válido o ya expiró. Solicita uno nuevo.
                  </p>
                </div>
              )}

              <AuthForm action={requestPasswordReset} submitLabel="Enviar enlace">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                               placeholder:text-gray-400"
                    placeholder="tu@gmail.com"
                  />
                </div>
              </AuthForm>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          <Link href="/login" className="font-medium text-brand underline underline-offset-2">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
