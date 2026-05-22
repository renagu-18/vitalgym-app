'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { createPayment } from '@/app/admin/payments/actions'

interface Client {
  id: string
  full_name: string
  subscription: { id: string; plan: { name: string; price_monthly: number } | null } | null
}

interface Props {
  clients: Client[]
}

export default function CreatePaymentForm({ clients: allClients }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientsWithSub = allClients.filter(c => c.subscription)
  const [clientId, setClientId] = useState(clientsWithSub[0]?.id ?? '')
  const today = new Date()
  const monthDefault = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const [month, setMonth] = useState(monthDefault)
  const [notes, setNotes] = useState('')

  const selectedClient = clientsWithSub.find(c => c.id === clientId)
  const [amount, setAmount] = useState(
    String(selectedClient?.subscription?.plan?.price_monthly ?? '')
  )

  function handleClientChange(id: string) {
    setClientId(id)
    const c = clientsWithSub.find(cl => cl.id === id)
    setAmount(String(c?.subscription?.plan?.price_monthly ?? ''))
  }

  function handleSubmit() {
    if (!clientId || !selectedClient?.subscription) return
    setError(null)
    startTransition(async () => {
      const res = await createPayment({
        clientId,
        subscriptionId: selectedClient.subscription!.id,
        amount: parseFloat(amount) || 0,
        month,
        notes: notes.trim() || null,
      })
      if (res?.error) { setError(res.error); return }
      setNotes('')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-gray-900">
        <span className="flex items-center gap-2">
          <Plus size={16} /> Registrar cobro
        </span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
          {clientsWithSub.length === 0 ? (
            <p className="text-sm text-gray-400">No hay clientes con suscripción activa.</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
                <select value={clientId} onChange={e => handleClientChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                  {clientsWithSub.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} · {c.subscription?.plan?.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
                  <input type="month" value={month.slice(0, 7)}
                    onChange={e => setMonth(e.target.value + '-01')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Monto ($)</label>
                  <input type="number" min="0" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Opcional..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={handleSubmit} disabled={isPending || !clientId}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50">
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Registrar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
