import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight, UserCircle } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa', paused: 'Pausada', expired: 'Vencida',
}
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  expired: 'bg-gray-100 text-gray-500',
}

export default async function AdminClientsPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .eq('role', 'client')
    .order('full_name')

  const clientIds = clients?.map(c => c.id) ?? []

  const { data: subscriptions } = clientIds.length
    ? await supabase
        .from('subscriptions')
        .select('id, client_id, status, classes_remaining, end_date, plans ( name )')
        .in('client_id', clientIds)
    : { data: [] }

  type SubRow = {
    id: string
    client_id: string
    status: string
    classes_remaining: number
    end_date: string | null
    plans: { name: string } | { name: string }[] | null
  }

  const subsByClient = (subscriptions as SubRow[] ?? []).reduce<Record<string, SubRow[]>>(
    (acc, s) => {
      ;(acc[s.client_id] ??= []).push(s)
      return acc
    },
    {}
  )

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Clientes</h2>

      {!clients?.length ? (
        <p className="text-sm text-gray-400 text-center py-12">No hay clientes registrados.</p>
      ) : (
        <div className="space-y-2">
          {clients.map(client => {
            const subs = subsByClient[client.id] ?? []
            const activeSub = subs.find(s => s.status === 'active')
              ?? subs.sort((a, b) =>
                new Date(b.end_date ?? '').getTime() - new Date(a.end_date ?? '').getTime()
              )[0]

            const planName = activeSub
              ? (Array.isArray(activeSub.plans)
                  ? (activeSub.plans[0] as { name: string } | undefined)?.name
                  : (activeSub.plans as { name: string } | null)?.name)
              : null

            return (
              <Link key={client.id} href={`/admin/clients/${client.id}`}
                className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-300 transition-colors">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <UserCircle size={22} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{client.full_name}</p>
                  <p className="text-xs text-gray-400 truncate">{client.phone ?? '—'}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {activeSub ? (
                    <>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[activeSub.status]}`}>
                        {STATUS_LABEL[activeSub.status]}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {activeSub.classes_remaining >= 9999 ? 'Ilimitadas' : `${activeSub.classes_remaining} clases`} · {planName ?? '—'}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                      Sin plan
                    </span>
                  )}
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
