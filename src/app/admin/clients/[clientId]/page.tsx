import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientProfileForm from '@/components/admin/ClientProfileForm'
import SubscriptionManager from '@/components/admin/SubscriptionManager'
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
        .select('available, is_unlimited, adjustments, used')
        .eq('subscription_id', subscription.id)
        .maybeSingle()
    : { data: null }

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
    </div>
  )
}
