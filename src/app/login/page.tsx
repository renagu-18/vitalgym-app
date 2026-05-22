import Link from 'next/link'
import { login } from '@/app/auth/actions'
import AuthForm from '@/components/auth/AuthForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo / marca */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">VitalGym</h1>
          <p className="mt-2 text-sm text-gray-500">Entrenamiento personalizado</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Iniciar sesión</h2>

          <AuthForm action={login} submitLabel="Entrar">
            <div className="space-y-4">
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

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                             placeholder:text-gray-400"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </AuthForm>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          ¿No tienes cuenta?{' '}
          <Link href="/register" className="font-medium text-brand underline underline-offset-2">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
