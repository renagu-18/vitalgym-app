import { createClient } from '@/lib/supabase/server'
import PaymentCard from '@/components/admin/PaymentCard'
import CreatePaymentForm from '@/components/admin/CreatePaymentForm'

type PaymentRow = {
  id: string
  client_id: string
  amount: number
  month: string
  status: 'pending' | 'paid' | 'overdue'
  paid_at: string | null
  notes: string | null
  client: { full_name: string } | null
}

export default async function AdminPaymentsPage() {
  const supabase = await createClient()

  const [{ data: rawPayments }, { data: clients }] = await Promise.all([
    supabase
      .from('payments')
      .select('id, client_id, amount, month, status, paid_at, notes, client:profiles!payments_client_id_fkey(full_name)')
      .order('month', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name, subscriptions(id, status, plan:plans(name, price_monthly))')
      .eq('role', 'client')
      .order('full_name'),
  ])

  // Supabase returns the joined row as array or object depending on relation type; normalize to object
  const payments: PaymentRow[] = (rawPayments ?? []).map(p => ({
    ...p,
    status: p.status as 'pending' | 'paid' | 'overdue',
    client: Array.isArray(p.client) ? (p.client[0] ?? null) : p.client,
  }))

  const clientsForForm = (clients ?? []).map(c => {
    const activeSub = (c.subscriptions as { id: string; status: string; plan: { name: string; price_monthly: number } | null }[] ?? [])
      .find(s => s.status === 'active') ?? null
    return {
      id: c.id,
      full_name: c.full_name,
      subscription: activeSub ? { id: activeSub.id, plan: activeSub.plan } : null,
    }
  })

  const pending = payments.filter(p => p.status !== 'paid')
  const paid = payments.filter(p => p.status === 'paid')

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Pagos</h2>

      <CreatePaymentForm clients={clientsForForm} />

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pendientes / Vencidos</p>
          {pending.map(p => <PaymentCard key={p.id} payment={p} />)}
        </div>
      )}

      {paid.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pagados</p>
          {paid.map(p => <PaymentCard key={p.id} payment={p} />)}
        </div>
      )}

      {!payments.length && (
        <p className="text-sm text-gray-400 text-center py-12">No hay cobros registrados.</p>
      )}
    </div>
  )
}
