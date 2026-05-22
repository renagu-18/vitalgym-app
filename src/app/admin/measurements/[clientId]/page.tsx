import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MeasurementForm from '@/components/measurements/MeasurementForm'
import MeasurementHistory from '@/components/measurements/MeasurementHistory'

interface Props {
  params: Promise<{ clientId: string }>
}

export default async function AdminClientMeasurementsPage({ params }: Props) {
  const { clientId } = await params
  const supabase = await createClient()

  const [{ data: profile }, { data: measurements }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', clientId)
      .eq('role', 'client')
      .single(),
    supabase
      .from('measurements')
      .select('*')
      .eq('client_id', clientId)
      .order('measured_at', { ascending: false }),
  ])

  if (!profile) notFound()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Medidas de {profile.full_name}</h2>
      </div>

      <MeasurementForm clientId={clientId} />

      <MeasurementHistory measurements={measurements ?? []} clientId={clientId} isAdmin />
    </div>
  )
}
