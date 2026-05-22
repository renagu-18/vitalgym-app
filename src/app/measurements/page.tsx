import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MeasurementHistory from '@/components/measurements/MeasurementHistory'

export default async function MeasurementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: measurements } = await supabase
    .from('measurements')
    .select('*')
    .eq('client_id', user.id)
    .order('measured_at', { ascending: false })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Mis medidas</h2>
      <MeasurementHistory measurements={measurements ?? []} clientId={user.id} isAdmin={false} />
    </div>
  )
}
