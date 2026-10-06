'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Check } from 'lucide-react'
import { createSubscription, updateSubscription, startScheduledSubscriptionNow } from '@/app/admin/clients/[clientId]/actions'
import type { SubscriptionStatus } from '@/types/database'

interface Plan { id: string; name: string; classes_per_month: number; price_monthly: number }
interface Sub {
  id: string
  status: SubscriptionStatus
  start_date: string
  end_date: string
  plan: Plan | null
}
interface Balance { available: number; is_unlimited: boolean; adjustments: number; used: number }

interface Props {
  clientId: string
  subscription: Sub | null
  balance: Balance | null
  plans: Plan[]
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Programada', active: 'Activa', paused: 'Pausada', expired: 'Vencida',
}
const STATUS_COLOR: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  expired: 'bg-gray-100 text-gray-500',
}

export default function SubscriptionManager({ clientId, subscription, balance, plans }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  // Form para nueva suscripción. "Hoy" es la fecha de Santiago (toISOString daría la de UTC, que
  // desde la tarde-noche ya es mañana y dejaba la suscripción programada, con 0 clases).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  // Por defecto empieza HOY: reemplaza a la actual (p.ej. de clase de prueba a un plan). Para una
  // renovación al terminar la actual hay un atajo debajo del campo de fecha.
  const [startDate, setStartDate] = useState(today)

  // Edición de la suscripción activa
  const [status, setStatus] = useState<SubscriptionStatus>(subscription?.status ?? 'active')
  const [editSub, setEditSub] = useState(false)

  function run(fn: () => Promise<{ error?: string | null }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) { setError(res.error); return }
      router.refresh()
    })
  }

  const selectedPlan = plans.find(p => p.id === planId)

  function handleCreateSub() {
    if (!planId) return
    run(() => createSubscription({
      clientId,
      planId,
      startDate,
    }).then(r => { if (!r.error) setShowNew(false); return r }))
  }

  function handleStartNow() {
    if (!subscription) return
    run(() => startScheduledSubscriptionNow(subscription.id, clientId))
  }

  function handleUpdateSub() {
    if (!subscription) return
    run(() => updateSubscription(subscription.id, clientId, { status }).then(r => { if (!r.error) setEditSub(false); return r }))
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Suscripción</p>
        {subscription && !editSub && (
          <button onClick={() => setEditSub(true)}
            className="text-xs text-gray-500 hover:text-gray-700">Editar</button>
        )}
      </div>

      {error && <p className="px-4 pt-3 text-xs text-red-600">{error}</p>}

      {!subscription && !showNew ? (
        <div className="p-6 text-center space-y-3">
          <p className="text-sm text-gray-400">Sin suscripción activa</p>
          <button onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white
                       text-sm font-semibold rounded-lg hover:bg-brand-dark">
            <Plus size={14} /> Crear suscripción
          </button>
        </div>
      ) : showNew ? (
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Plan</label>
            <select value={planId} onChange={e => setPlanId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand">
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.price_monthly === 0 ? ' ★' : ''} — {p.classes_per_month >= 9999 ? 'Ilimitadas' : `${p.classes_per_month} clases/mes`} · {p.price_monthly === 0 ? 'Gratis' : `$${p.price_monthly.toLocaleString('es-CL')}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Inicio</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand" />
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <button type="button" onClick={() => setStartDate(today)} className="text-brand font-semibold">Hoy</button>
              {subscription && subscription.end_date > today && (
                <button type="button" onClick={() => setStartDate(subscription.end_date)} className="text-brand font-semibold">
                  Al terminar la actual ({new Date(subscription.end_date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })})
                </button>
              )}
            </div>
            <p className={`mt-1 text-xs font-medium ${startDate > today ? 'text-blue-600' : 'text-green-700'}`}>
              {startDate > today
                ? 'Quedará programada: el cliente no tendrá clases de este plan hasta esa fecha.'
                : subscription
                  ? 'Empieza hoy y reemplaza a la suscripción actual (sus clases sobrantes se pierden).'
                  : 'Empieza hoy.'}
            </p>
          </div>
          {selectedPlan && (
            <p className="text-xs text-gray-400">
              {selectedPlan.classes_per_month >= 9999
                ? 'Free pass con clases ilimitadas y sin costo.'
                : `Se asignarán ${selectedPlan.classes_per_month} clases al mes automáticamente.`}
              {' '}Vence automáticamente 3 meses después del inicio, y se generan 3 pagos
              mensuales pendientes de ${selectedPlan.price_monthly.toLocaleString('es-CL')} cada uno.
              {' '}Si el inicio es una fecha futura, queda programada y se activa sola ese día.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowNew(false)} disabled={isPending}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
              Cancelar
            </button>
            <button onClick={handleCreateSub} disabled={isPending}
              className="flex-1 py-2 bg-brand text-white rounded-lg text-sm font-semibold
                         hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-1">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Crear
            </button>
          </div>
        </div>
      ) : subscription ? (
        <div className="p-4">
          {editSub ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Clases disponibles</label>
                  <input type="text" readOnly disabled
                    value={balance ? (balance.is_unlimited ? 'Ilimitadas' : balance.available) : '—'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                               bg-gray-50 text-gray-500 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                  <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="scheduled">Programada</option>
                    <option value="active">Activa</option>
                    <option value="paused">Pausada</option>
                    <option value="expired">Vencida</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Las clases ya no se editan a mano: se calculan (plan + ajustes − usadas). Para sumar o
                restar clases se carga un ajuste en class_adjustments (por ahora por SQL, ver
                supabase/README.md; el botón llega con el panel admin).
              </p>
              <div className="flex gap-2">
                <button onClick={() => setEditSub(false)} disabled={isPending}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                  Cancelar
                </button>
                <button onClick={handleUpdateSub} disabled={isPending}
                  className="flex-1 py-2 bg-brand text-white rounded-lg text-sm font-semibold
                             hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-1">
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{subscription.plan?.name}</p>
                  {subscription.plan?.price_monthly === 0 && (
                    <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                      FREE
                    </span>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[subscription.status]}`}>
                  {STATUS_LABEL[subscription.status]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className={`rounded-lg p-2 ${balance?.is_unlimited ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <p className={`text-lg font-bold ${balance?.is_unlimited ? 'text-green-700' : 'text-gray-900'}`}>
                    {balance ? (balance.is_unlimited ? '∞' : balance.available) : '—'}
                  </p>
                  <p className="text-[10px] text-gray-400">clases disp.</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs font-semibold text-gray-700">
                    {new Date(subscription.start_date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-[10px] text-gray-400">inicio</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs font-semibold text-gray-700">
                    {new Date(subscription.end_date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-[10px] text-gray-400">vence</p>
                </div>
              </div>
              {subscription.status === 'scheduled' && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-blue-800">
                    Este plan está programado y todavía no está vigente, por eso el cliente ve 0 clases.
                  </p>
                  <button onClick={handleStartNow} disabled={isPending}
                    className="w-full py-2 bg-brand text-white rounded-lg text-xs font-semibold hover:bg-brand-dark
                               disabled:opacity-50 flex items-center justify-center gap-1">
                    {isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Iniciar hoy
                  </button>
                </div>
              )}
              <button onClick={() => setShowNew(true)}
                className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs
                           text-gray-400 hover:border-gray-300 hover:text-gray-600 flex items-center justify-center gap-1">
                <Plus size={12} /> Nueva suscripción
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
