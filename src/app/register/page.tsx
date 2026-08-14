import Link from 'next/link'
import { register } from '@/app/auth/actions'
import AuthForm from '@/components/auth/AuthForm'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">VitalGym</h1>
          <p className="mt-2 text-sm text-gray-500">Crea tu cuenta</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Registro</h2>

          <AuthForm action={register} submitLabel="Crear cuenta">
            <div className="space-y-4">
              <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre completo
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  required
                  autoComplete="name"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                             placeholder:text-gray-400"
                  placeholder="Juan Pérez"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Correo Gmail
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
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                             placeholder:text-gray-400"
                  placeholder="+56 9 1234 5678"
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
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                             placeholder:text-gray-400"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recibirás notificaciones por
                </label>
                <div className="flex items-center gap-2 p-3 border border-brand rounded-lg bg-gray-50">
                  <input type="radio" name="notify_via" value="gmail" checked readOnly
                         className="accent-brand" />
                  <span className="text-sm font-medium">Gmail</span>
                </div>
              </div>
            </div>
          </AuthForm>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-medium text-gray-900 underline underline-offset-2">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
