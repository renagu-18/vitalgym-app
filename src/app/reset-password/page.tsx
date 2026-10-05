import { updatePassword } from '@/app/auth/actions'
import AuthForm from '@/components/auth/AuthForm'

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">VitalGym</h1>
          <p className="mt-2 text-sm text-gray-500">Elige tu nueva contraseña</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Nueva contraseña</h2>

          <AuthForm action={updatePassword} submitLabel="Guardar contraseña">
            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Nueva contraseña
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
                <label htmlFor="password_confirmation" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar contraseña
                </label>
                <input
                  id="password_confirmation"
                  name="password_confirmation"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                             placeholder:text-gray-400"
                  placeholder="Repite la contraseña"
                />
              </div>
            </div>
          </AuthForm>
        </div>
      </div>
    </div>
  )
}
