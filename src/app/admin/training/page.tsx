import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight, Dumbbell, Plus } from 'lucide-react'

export default async function AdminTrainingPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      routines(id, name, is_active),
      training_logs(log_date)
    `)
    .eq('role', 'client')
    .order('full_name')

  type ClientRow = {
    id: string
    full_name: string
    routines: { id: string; name: string; is_active: boolean }[]
    training_logs: { log_date: string }[]
  }

  const rows = (clients ?? []) as ClientRow[]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Entrenamiento</h2>
        <p className="text-sm text-gray-500 mt-1">Gestiona rutinas y sesiones por cliente</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <Dumbbell size={28} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aún no hay clientes registrados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(client => {
            const activeRoutine = client.routines.find(r => r.is_active)
            const dates = client.training_logs.map(l => l.log_date).sort().reverse()
            const lastSession = dates[0]
              ? new Date(dates[0] + 'T12:00:00').toLocaleDateString('es-CL', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })
              : null

            return (
              <Link
                key={client.id}
                href={`/admin/training/${client.id}`}
                className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-4
                           hover:border-gray-200 hover:shadow-sm transition-all"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center
                                justify-center text-sm font-bold flex-shrink-0">
                  {client.full_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{client.full_name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {activeRoutine ? (
                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        {activeRoutine.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Plus size={10} /> Sin rutina
                      </span>
                    )}
                    {lastSession && (
                      <span className="text-xs text-gray-400">Última sesión: {lastSession}</span>
                    )}
                  </div>
                </div>

                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
