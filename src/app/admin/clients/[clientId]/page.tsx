import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientProfileForm from '@/components/admin/ClientProfileForm'
import SubscriptionManager from '@/components/admin/SubscriptionManager'
import ClassBalanceCard, { type AdjustmentRow, type ReturnableBooking } from '@/components/admin/ClassBalanceCard'
import type { SubscriptionStatus } from '@/types/database'

interface Props {
  params: Promise<{ clientId: string }>
}

type SubRow = {
  id: string
  status: SubscriptionStatus
  start_date: string
  end_date: string
  plan: { id: string; name: string; classes_per_month: number; price_monthly: number } | null
}

export default async function AdminClientDetailPage({ params }: Props) {
  const { clientId } = await params
  const supabase = await createClient()

  const [{ data: profile }, { data: rawSubs }, { data: plans }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, notify_via')
      .eq('id', clientId)
      .eq('role', 'client')
      .single(),
    supabase
      .from('subscriptions')
      .select('id, status, start_date, end_date, plan:plans(id, name, classes_per_month, price_monthly)')
      .eq('client_id', clientId)
      .in('status', ['active', 'scheduled'])
      .order('start_date'),
    supabase
      .from('plans')
      .select('id, name, classes_per_month, price_monthly')
      .order('price_monthly'),
  ])

  if (!profile) notFound()

  // La vigente; si no hay, la próxima programada.
  const subs = (rawSubs ?? []) as unknown as SubRow[]
  const subscription = subs.find(s => s.status === 'active') ?? subs[0] ?? null

  // Saldo derivado (plan + ajustes - usadas), no el contador legado classes_remaining.
  const { data: balance } = subscription
    ? await supabase
        .from('subscription_class_balance')
        .select('available, is_unlimited, entitled, adjustments, used')
        .eq('subscription_id', subscription.id)
        .maybeSingle()
    : { data: null }

  // Historial de ajustes de TODAS las suscripciones del cliente (solo lo ve el admin: esta página
  // es del panel admin y class_adjustments solo deja leer al admin o al dueño).
  type RawAdj = {
    id: string; quantity: number; reason: string; created_at: string; booking_id: string | null
    subscriptions: { client_id: string } | { client_id: string }[] | null
    booking: { time_blocks: { start_time: string } | { start_time: string }[] | null }
      | { time_blocks: { start_time: string } | { start_time: string }[] | null }[] | null
  }
  const { data: rawAdj } = await supabase
    .from('class_adjustments')
    .select('id, quantity, reason, created_at, booking_id, subscriptions!inner(client_id), booking:bookings(time_blocks(start_time))')
    .eq('subscriptions.client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

  const adjustmentRows = (rawAdj as unknown as RawAdj[] | null) ?? []
  const adjustments: AdjustmentRow[] = adjustmentRows.map(a => ({
    id: a.id,
    quantity: a.quantity,
    reason: a.reason,
    created_at: a.created_at,
    bookingStart: one(one(a.booking)?.time_blocks)?.start_time ?? null,
    bookingStatus: null,
  }))
  const refundedBookingIds = new Set(
    adjustmentRows.filter(a => a.booking_id && a.quantity > 0).map(a => a.booking_id as string)
  )

  // Reservas que descontaron por inasistencia / cancelación tardía (candidatas a devolución).
  type RawBk = {
    id: string; status: string; late_cancel: boolean
    time_blocks: { start_time: string } | { start_time: string }[] | null
  }
  const { data: rawBk } = await supabase
    .from('bookings')
    .select('id, status, late_cancel, time_blocks(start_time)')
    .eq('client_id', clientId)
    .or('status.eq.no_show,and(status.eq.cancelled,late_cancel.eq.true)')
    .order('updated_at', { ascending: false })
    .limit(20)
  const returnable: ReturnableBooking[] = ((rawBk as unknown as RawBk[] | null) ?? [])
    .map(b => {
      const tb = one(b.time_blocks)
      return tb
        ? { id: b.id, start: tb.start_time, kind: (b.status === 'no_show' ? 'no_show' : 'cancelled_late') as ReturnableBooking['kind'], refunded: refundedBookingIds.has(b.id) }
        : null
    })
    .filter((x): x is ReturnableBooking => x !== null)
    .sort((a, b) => b.start.localeCompare(a.start))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{profile.full_name}</h2>
        {profile.phone && <p className="text-sm text-gray-400">{profile.phone}</p>}
      </div>

      <ClientProfileForm
        clientId={profile.id}
        fullName={profile.full_name}
        phone={profile.phone}
        notifyVia={profile.notify_via}
      />

      <SubscriptionManager
        clientId={clientId}
        subscription={subscription}
        balance={balance}
        plans={plans ?? []}
      />

      <ClassBalanceCard
        clientId={clientId}
        balance={balance}
        adjustments={adjustments}
        returnable={returnable}
      />
    </div>
  )
}
