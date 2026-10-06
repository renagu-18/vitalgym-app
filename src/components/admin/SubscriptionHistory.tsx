import type { SubscriptionHistoryRow } from '@/types/database'

// Historial de planes del cliente: cada suscripción que se le puso queda acá (más reciente primero),
// con su estado real por fechas, las clases que usó o perdió y cómo van sus pagos.
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Programada', active: 'Activa', paused: 'Pausada', expired: 'Finalizada',
}
const STATUS_COLOR: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  expired: 'bg-gray-100 text-gray-500',
}

const fmt = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })

export default function SubscriptionHistory({ rows }: { rows: SubscriptionHistoryRow[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-sm font-semibold text-gray-900">Historial de planes</p>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-gray-400">Todavía no tiene planes.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(r => {
            const hasPayments = r.payments_paid + r.payments_pending > 0
            return (
              <div key={r.subscription_id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{r.plan_name}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[r.effective_status]}`}>
                    {STATUS_LABEL[r.effective_status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{fmt(r.start_date)} → {fmt(r.end_date)}</p>
                <p className="text-xs text-gray-400">
                  {r.entitled === null
                    ? `Ilimitado · ${r.used} clase${r.used !== 1 ? 's' : ''} tomada${r.used !== 1 ? 's' : ''}`
                    : `${r.used} de ${r.entitled + r.adjustments} clases usadas`}
                  {r.lost_classes > 0 && ` · ${r.lost_classes} sin usar al terminar`}
                  {' · '}
                  {hasPayments
                    ? `Pagos: ${r.payments_paid} pagados, ${r.payments_pending} pendientes${r.payments_overdue > 0 ? ` (${r.payments_overdue} vencidos)` : ''}`
                    : 'Sin cobro'}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
