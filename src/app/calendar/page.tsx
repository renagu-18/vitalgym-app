import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MonthCalendar from '@/components/calendar/MonthCalendar'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const nowSantiago = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' })
  )
  const todayKey = nowSantiago.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

  let year = nowSantiago.getFullYear()
  let month = nowSantiago.getMonth()

  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const [y, m] = params.month.split('-').map(Number)
    if (y >= 2025 && y <= 2028 && m >= 1 && m <= 12) {
      year = y
      month = m - 1
    }
  }

  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59)

  const { data: timeBlocks } = await supabase
    .from('time_blocks')
    .select('*')
    .eq('is_active', true)
    .gte('start_time', monthStart.toISOString())
    .lte('start_time', monthEnd.toISOString())
    .order('start_time')

  const blockIds = (timeBlocks ?? []).map(b => b.id)

  const { data: myBookings } = blockIds.length
    ? await supabase
        .from('bookings')
        .select('id, time_block_id, status')
        .eq('client_id', user.id)
        .in('time_block_id', blockIds)
        .neq('status', 'cancelled')
    : { data: [] }

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

  return (
    <MonthCalendar
      timeBlocks={timeBlocks ?? []}
      myBookings={myBookings ?? []}
      month={monthStr}
      todayKey={todayKey}
      serverNow={new Date().toISOString()}
    />
  )
}
