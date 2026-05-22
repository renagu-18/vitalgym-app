import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientProfileForm from '@/components/admin/ClientProfileForm'
import SubscriptionManager from '@/components/admin/SubscriptionManager'

interface Props {
  params: Promise<{ clientId: string }>
}

type SubRow = {
  id: string
  status: 'active' | 'paused' | 'expired'
  start_date: string
  end_date: string
  classes_remaining: number
  plan: { id: string; name: string; classes_per_month: number; price_monthly: number } | null
}

export default async function AdminClientDetailPage({ params }: Props) {
  const { clientId } = await params
  const supabase = await createClient()

  const [{ data: profile }, { data: rawSub }, { data: plans }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, notify_via')
      .eq('id', clientId)
      .eq('role', 'client')
      .single(),
    supabase
      .from('subscriptions')
      .select('id, status, start_date, end_date, classes_remaining, plan:plans(id, name, classes_per_month, price_monthly)')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('plans')
      .select('id, name, classes_per_month, price_monthly')
      .order('price_monthly'),
  ])

  if (!profile) notFound()

  const subscription = rawSub as SubRow | null

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
        plans={plans ?? []}
      />
    </div>
  )
}
