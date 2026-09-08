'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Check } from 'lucide-react'
import { createSubscription, updateSubscription } from '@/app/admin/clients/[clientId]/actions'

interface Plan { id: string; name: string; classes_per_month: number; price_monthly: number }
interface Sub {
  id: string
  status: 'active' | 'paused' | 'expired'
  start_date: string
  end_date: string
  classes_remaining: number
  plan: Plan | null
}

interface Props {
  clientId: string
  subscription: Sub | null
  plans: Plan[]
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa', paused: 'Pausada', expired: 'Vencida',
}
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  expired: 'bg-gray-100 text-gray-500',
}

export default function SubscriptionManager({ clientId, subscription, plans }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  // Form para nueva suscripción
  const today = new Date().toISOString().split('T')[0]
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  const [startDate, setStartDate] = useState(today)

  // Edición de la suscripción activa
  const [classes, setClasses] = useState(subscription?.classes_remaining ?? 0)
  const [status, setStatus] = useState<'active' | 'paused' | 'expired'>(subscription?.status ?? 'active')
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
      classesRemaining: selectedPlan?.classes_per_month ?? 0,
    }).then(r => { if (!r.error) setShowNew(false); return r }))
  }

  function handleUpdateSub() {
    if (!subscription) return
    run(() => updateSubscription(subscription.id, clientId, {
      classesRemaining: classes,
      status,
    }).then(r => { if (!r.error) setEditSub(false); return r }))
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
          </div>
          {selectedPlan && (
            <p className="text-xs text-gray-400">
              {selectedPlan.classes_per_month >= 9999
                ? 'Free pass con clases ilimitadas y sin costo.'
                : `Se asignarán ${selectedPlan.classes_per_month} clases al mes automáticamente.`}
              {' '}Vence automáticamente 3 meses después del inicio, y se generan 3 pagos
              mensuales pendientes de ${selectedPlan.price_monthly.toLocaleString('es-CL')} cada uno.
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
                  <input type="number" min={0} value={classes}
                    onChange={e => setClasses(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                  <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="active">Activa</option>
                    <option value="paused">Pausada</option>
                    <option value="expired">Vencida</option>
                  </select>
                </div>
              </div>
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
                <div className={`rounded-lg p-2 ${subscription.classes_remaining >= 9999 ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <p className={`text-lg font-bold ${subscription.classes_remaining >= 9999 ? 'text-green-700' : 'text-gray-900'}`}>
                    {subscription.classes_remaining >= 9999 ? '∞' : subscription.classes_remaining}
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
