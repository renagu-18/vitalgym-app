import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight, UserCircle } from 'lucide-react'

export default async function AdminMeasurementsPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'client')
    .order('full_name')

  // Get last measurement date per client
  const { data: lastMeasurements } = await supabase
    .from('measurements')
    .select('client_id, measured_at')
    .order('measured_at', { ascending: false })

  const lastByClient = new Map<string, string>()
  for (const m of lastMeasurements ?? []) {
    if (!lastByClient.has(m.client_id)) {
      lastByClient.set(m.client_id, m.measured_at)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Medidas corporales</h2>

      {!clients?.length ? (
        <p className="text-sm text-gray-400 text-center py-12">No hay clientes registrados.</p>
      ) : (
        <div className="space-y-2">
          {clients.map(client => {
            const lastDate = lastByClient.get(client.id)
            return (
              <Link key={client.id} href={`/admin/measurements/${client.id}`}
                className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-300 transition-colors">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <UserCircle size={22} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{client.full_name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {lastDate
                      ? `Última medición: ${new Date(lastDate + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'Sin mediciones'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
