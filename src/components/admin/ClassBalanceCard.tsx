'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Check } from 'lucide-react'
import { addClassAdjustment, returnClass } from '@/app/admin/classes/actions'
import { ADJUSTMENT_REASONS, type AdjustmentReason, type RefundReason } from '@/lib/class-adjustments'

const TZ = 'America/Santiago'

export interface Balance {
  available: number
  is_unlimited: boolean
  entitled: number | null
  adjustments: number
  used: number
}
export interface AdjustmentRow {
  id: string
  quantity: number
  reason: string
  created_at: string
  /** fecha de la clase de la reserva asociada, si hay */
  bookingStart: string | null
  bookingStatus: string | null
}
export interface ReturnableBooking {
  id: string
  start: string
  kind: 'no_show' | 'cancelled_late'
  refunded: boolean
}

interface Props {
  clientId: string
  balance: Balance | null
  adjustments: AdjustmentRow[]
  returnable: ReturnableBooking[]
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
  })
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: TZ })

const KIND_LABEL = { no_show: 'No vino', cancelled_late: 'Canceló tarde' }

export default function ClassBalanceCard({ clientId, balance, adjustments, returnable }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState<AdjustmentReason>('recuperación')
  const [note, setNote] = useState('')
  const [refundingId, setRefundingId] = useState<string | null>(null)

  function run(fn: () => Promise<{ error?: string | null }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) { setError(res.error); return }
      onOk?.()
      router.refresh()
    })
  }

  function handleAdd() {
    run(
      () => addClassAdjustment({ clientId, quantity: Number(quantity), reason, note }),
      () => { setShowForm(false); setQuantity('1'); setNote(''); setReason('recuperación') },
    )
  }

  const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand'

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Clases</p>
        {balance && !balance.is_unlimited && !showForm && (
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
            <Plus size={12} /> Sumar clases
          </button>
        )}
      </div>

      {error && <p className="px-4 pt-3 text-xs text-red-600">{error}</p>}

      <div className="p-4 space-y-4">
        {!balance ? (
          <p className="text-sm text-gray-400">Sin suscripción vigente.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="disponibles" value={balance.is_unlimited ? '∞' : balance.available} strong />
            <Stat label="del plan" value={balance.entitled ?? '—'} />
            <Stat label="ajustes" value={balance.adjustments > 0 ? `+${balance.adjustments}` : balance.adjustments} />
            <Stat label="usadas" value={balance.used} />
          </div>
        )}

        {showForm && (
          <div className="space-y-3 border border-gray-100 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad (+/−)</label>
                <input type="number" step={1} value={quantity} onChange={e => setQuantity(e.target.value)} className={input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Motivo</label>
                <select value={reason} onChange={e => setReason(e.target.value as AdjustmentReason)} className={input}>
                  {ADJUSTMENT_REASONS.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Nota {reason === 'otro' ? '(obligatoria)' : '(opcional)'}
              </label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={200} className={input} />
            </div>
            <p className="text-xs text-gray-400">Se aplica a la suscripción vigente. Negativa = resta clases.</p>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setError(null) }} disabled={isPending}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">Cancelar</button>
              <button onClick={handleAdd} disabled={isPending}
                className="flex-1 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark
                           disabled:opacity-50 flex items-center justify-center gap-1">
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aplicar
              </button>
            </div>
          </div>
        )}

        {/* Clases descontadas por inasistencia o cancelación tardía: se pueden devolver */}
        {returnable.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Clases descontadas por inasistencia</p>
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
              {returnable.map(b => (
                <div key={b.id} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-gray-700 flex-1 min-w-0">
                    {fmtDateTime(b.start)} · <span className="text-gray-400">{KIND_LABEL[b.kind]}</span>
                  </p>
                  {b.refunded ? (
                    <span className="text-xs text-green-700">Devuelta</span>
                  ) : refundingId === b.id ? (
                    <div className="flex items-center gap-1.5">
                      {(['reagendada', 'excepción'] as RefundReason[]).map(r => (
                        <button key={r} disabled={isPending}
                          onClick={() => run(() => returnClass(b.id, r), () => setRefundingId(null))}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700
                                     hover:border-gray-400 capitalize disabled:opacity-50">{r}</button>
                      ))}
                      <button onClick={() => setRefundingId(null)} className="text-xs text-gray-400">×</button>
                    </div>
                  ) : (
                    <button onClick={() => setRefundingId(b.id)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-brand/40 text-brand hover:bg-brand/5">
                      Devolver clase
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historial de ajustes (solo admin) */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">Historial de ajustes</p>
          {adjustments.length === 0 ? (
            <p className="text-sm text-gray-400">Sin ajustes todavía.</p>
          ) : (
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
              {adjustments.map(a => (
                <div key={a.id} className="px-3 py-2 flex items-start gap-3">
                  <span className={`text-sm font-bold tabular-nums w-8 shrink-0 ${a.quantity > 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {a.quantity > 0 ? `+${a.quantity}` : a.quantity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 break-words">{a.reason}</p>
                    {a.bookingStart && (
                      <p className="text-xs text-gray-400">Reserva del {fmtDateTime(a.bookingStart)}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{fmtDay(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className={`rounded-lg p-2 ${strong ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <p className={`text-lg font-bold ${strong ? 'text-white' : 'text-gray-900'}`}>{value}</p>
      <p className={`text-[10px] ${strong ? 'text-white/60' : 'text-gray-400'}`}>{label}</p>
    </div>
  )
}
