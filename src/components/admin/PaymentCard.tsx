'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, AlertCircle, Trash2, Loader2 } from 'lucide-react'
import { markPaymentPaid, markPaymentOverdue, deletePayment } from '@/app/admin/payments/actions'

interface Payment {
  id: string
  client_id: string
  amount: number
  month: string
  status: 'pending' | 'paid' | 'overdue'
  paid_at: string | null
  notes: string | null
  client: { full_name: string } | null
}

interface Props {
  payment: Payment
}

const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-600',
}
const STATUS_LABEL = {
  pending: 'Pendiente',
  paid: 'Pagado',
  overdue: 'Vencido',
}

export default function PaymentCard({ payment }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<{ error?: string | null }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) { setError(res.error); return }
      router.refresh()
    })
  }

  const monthLabel = new Date(payment.month + 'T12:00:00')
    .toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{payment.client?.full_name}</p>
          <p className="text-xs text-gray-400 capitalize">{monthLabel}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[payment.status]}`}>
          {STATUS_LABEL[payment.status]}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-gray-900">
          ${payment.amount.toLocaleString('es-CL')}
        </p>
        {payment.paid_at && (
          <p className="text-xs text-gray-400">
            Pagado el {new Date(payment.paid_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
          </p>
        )}
      </div>

      {payment.notes && <p className="text-xs text-gray-400 italic">{payment.notes}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        {payment.status !== 'paid' && (
          <button onClick={() => run(() => markPaymentPaid(payment.id))} disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50">
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Marcar pagado
          </button>
        )}
        {payment.status === 'pending' && (
          <button onClick={() => run(() => markPaymentOverdue(payment.id))} disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-amber-200 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-50 disabled:opacity-50">
            <AlertCircle size={12} />
            Vencido
          </button>
        )}
        <button onClick={() => run(() => deletePayment(payment.id))} disabled={isPending}
          className="p-2 border border-gray-200 rounded-lg text-gray-400 hover:text-red-500 hover:border-red-200 disabled:opacity-50">
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
}
