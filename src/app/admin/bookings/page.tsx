import { createClient } from '@/lib/supabase/server'
import WeeklyCalendar from '@/components/admin/WeeklyCalendar'

interface Props {
  searchParams: Promise<{ week?: string }>
}

export type BlockData = {
  id: string
  start_time: string
  end_time: string
  max_capacity: number
  current_count: number
  clients: { id: string; full_name: string; bookingId: string }[]
}

export default async function AdminBookingsPage({ searchParams }: Props) {
  const { week: weekStr } = await searchParams
  const weekOffset = parseInt(weekStr ?? '0', 10) || 0

  const supabase = await createClient()

  // Monday 00:00 UTC for target week
  const now = new Date()
  const utcDay = now.getUTCDay()
  const daysToMonday = utcDay === 0 ? -6 : 1 - utcDay

  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + daysToMonday + weekOffset * 7)
  monday.setUTCHours(0, 0, 0, 0)

  const nextMonday = new Date(monday)
  nextMonday.setUTCDate(monday.getUTCDate() + 7)

  const { data: rawBlocks } = await supabase
    .from('time_blocks')
    .select('id, start_time, end_time, max_capacity, current_count')
    .gte('start_time', monday.toISOString())
    .lt('start_time', nextMonday.toISOString())
    .order('start_time')

  const blockIds = rawBlocks?.map(b => b.id) ?? []

  const { data: rawBookings } = blockIds.length
    ? await supabase
        .from('bookings')
        .select('id, time_block_id, client:profiles!bookings_client_id_fkey(id, full_name)')
        .eq('status', 'approved')
        .in('time_block_id', blockIds)
    : { data: [] }

  type RawBooking = {
    id: string
    time_block_id: string
    client: { id: string; full_name: string } | { id: string; full_name: string }[] | null
  }

  const clientsByBlock = new Map<string, { id: string; full_name: string; bookingId: string }[]>()
  for (const b of (rawBookings as RawBooking[]) ?? []) {
    const c = Array.isArray(b.client) ? b.client[0] : b.client
    if (c) {
      const list = clientsByBlock.get(b.time_block_id) ?? []
      list.push({ ...c, bookingId: b.id })
      clientsByBlock.set(b.time_block_id, list)
    }
  }

  const blocks: BlockData[] = (rawBlocks ?? []).map(b => ({
    ...b,
    clients: clientsByBlock.get(b.id) ?? [],
  }))

  return (
    <WeeklyCalendar
      blocks={blocks}
      weekOffset={weekOffset}
      mondayISO={monday.toISOString()}
    />
  )
}
