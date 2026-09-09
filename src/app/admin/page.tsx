import { createClient } from '@/lib/supabase/server'
import { Users, CalendarDays, Dumbbell, Ruler, CreditCard, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import TodayPanel, { type TodayEntry } from '@/components/admin/TodayPanel'

const TZ = 'America/Santiago'

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const [
    { count: totalClients },
    { count: todayBookings },
    { count: pendingPayments },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'client'),
    supabase
      .from('bookings')
      .select('*, time_blocks!inner(start_time)', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('time_blocks.start_time', new Date().toISOString().split('T')[0])
      .lt('time_blocks.start_time', new Date(Date.now() + 86400000).toISOString().split('T')[0]),
    supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  const pendingPay = pendingPayments ?? 0

  // ── Vista "Hoy" ──────────────────────────────────────────────────────────
  // Ventana amplia en UTC (±1 día) para no perder bloques por el offset de zona horaria;
  // el filtro exacto por día se hace abajo comparando dayKey(start_time) === todayKey
  // (mismo patrón que MonthCalendar/WeeklyCalendar).
  const todayKey = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
    .toLocaleDateString('en-CA', { timeZone: TZ })
  const wideStart = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const wideEnd = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

  type RawTodayBooking = {
    id: string
    client: { id: string; full_name: string } | { id: string; full_name: string }[] | null
    time_blocks: { id: string; start_time: string; end_time: string }
      | { id: string; start_time: string; end_time: string }[] | null
  }

  const { data: rawTodayBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      client:profiles!bookings_client_id_fkey(id, full_name),
      time_blocks!inner(id, start_time, end_time)
    `)
    .eq('status', 'approved')
    .gte('time_blocks.start_time', wideStart)
    .lte('time_blocks.start_time', wideEnd)

  const todaySlots = ((rawTodayBookings as RawTodayBooking[] | null) ?? [])
    .map(b => {
      const client = Array.isArray(b.client) ? b.client[0] : b.client
      const block = Array.isArray(b.time_blocks) ? b.time_blocks[0] : b.time_blocks
      return client && block ? { bookingId: b.id, client, block } : null
    })
    .filter((x): x is { bookingId: string; client: { id: string; full_name: string }; block: { id: string; start_time: string; end_time: string } } => x !== null)
    .filter(x => dayKey(x.block.start_time) === todayKey)
    .sort((a, b) => a.block.start_time.localeCompare(b.block.start_time))

  const todayClientIds = Array.from(new Set(todaySlots.map(s => s.client.id)))

  type RoutineRow = { id: string; client_id: string; name: string; is_active: boolean; description: string | null }
  type ExerciseRow = {
    id: string; routine_id: string; name: string; sets: number | null
    reps: string | null; suggested_weight: string | null; notes: string | null; order_index: number
  }
  type LogExercise = {
    id: string; exercise_name: string; sets_done: number | null
    reps_done: string | null; weight_used: string | null; notes: string | null
  }
  type LogRow = { id: string; client_id: string; log_date: string; notes: string | null; exercise_logs: LogExercise[] | null }

  const { data: allRoutinesRawData } = todayClientIds.length
    ? await supabase
        .from('routines')
        .select('id, client_id, name, is_active, description')
        .in('client_id', todayClientIds)
        .order('created_at', { ascending: false })
    : { data: [] }
  const allRoutinesRaw = (allRoutinesRawData as RoutineRow[] | null) ?? []

  const { data: logsRawData } = todayClientIds.length
    ? await supabase
        .from('training_logs')
        .select(`
          id, client_id, log_date, notes,
          exercise_logs(id, exercise_name, sets_done, reps_done, weight_used, notes)
        `)
        .in('client_id', todayClientIds)
        .order('log_date', { ascending: false })
    : { data: [] }
  const logsRaw = (logsRawData as LogRow[] | null) ?? []

  const routineIds = allRoutinesRaw.map(r => r.id)
  const { data: exercisesRawData } = routineIds.length
    ? await supabase.from('exercises').select('*').in('routine_id', routineIds).order('order_index')
    : { data: [] }
  const exercisesRaw = (exercisesRawData as ExerciseRow[] | null) ?? []

  const exercisesByRoutine = new Map<string, ExerciseRow[]>()
  for (const ex of exercisesRaw) {
    const list = exercisesByRoutine.get(ex.routine_id) ?? []
    list.push(ex)
    exercisesByRoutine.set(ex.routine_id, list)
  }

  const routinesByClient = new Map<string, RoutineRow[]>()
  for (const r of allRoutinesRaw) {
    const list = routinesByClient.get(r.client_id) ?? []
    list.push(r)
    routinesByClient.set(r.client_id, list)
  }

  // logsRaw ya viene ordenado log_date desc; nos quedamos con las últimas 3 sesiones por cliente.
  const lastSessionsByClient = new Map<string, LogRow[]>()
  for (const log of logsRaw) {
    const list = lastSessionsByClient.get(log.client_id) ?? []
    if (list.length < 3) list.push(log)
    lastSessionsByClient.set(log.client_id, list)
  }

  const todayEntries: TodayEntry[] = todaySlots.map(slot => {
    const clientRoutines = routinesByClient.get(slot.client.id) ?? []
    const active = clientRoutines.find(r => r.is_active) ?? null
    const lastLogs = lastSessionsByClient.get(slot.client.id) ?? []

    return {
      bookingId: slot.bookingId,
      blockStart: slot.block.start_time,
      blockEnd: slot.block.end_time,
      client: slot.client,
      allRoutines: clientRoutines.map(r => ({ id: r.id, name: r.name, is_active: r.is_active })),
      routine: active
        ? {
            id: active.id,
            name: active.name,
            description: active.description,
            exercises: exercisesByRoutine.get(active.id) ?? [],
          }
        : null,
      lastSessions: lastLogs.map(log => ({
        date: log.log_date,
        notes: log.notes,
        exercises: log.exercise_logs ?? [],
      })),
    }
  })

  const quickActions = [
    {
      href: '/admin/bookings',
      icon: CalendarDays,
      label: 'Reservas',
      description: 'Clases confirmadas',
      accent: 'bg-blue-50 text-blue-600',
    },
    {
      href: '/admin/clients',
      icon: Users,
      label: 'Clientes',
      description: 'Perfiles y planes',
      accent: 'bg-green-50 text-green-600',
    },
    {
      href: '/admin/calendar',
      icon: CalendarDays,
      label: 'Calendario',
      description: 'Bloques horarios',
      accent: 'bg-teal-50 text-teal-600',
    },
    {
      href: '/admin/training',
      icon: Dumbbell,
      label: 'Rutinas',
      description: 'Crear y asignar',
      accent: 'bg-purple-50 text-purple-600',
    },
    {
      href: '/admin/measurements',
      icon: Ruler,
      label: 'Medidas',
      description: 'Registro corporal',
      accent: 'bg-amber-50 text-amber-600',
    },
    {
      href: '/admin/payments',
      icon: CreditCard,
      label: 'Pagos',
      description: 'Historial y cobros',
      accent: 'bg-brand/10 text-brand',
    },
  ]

  return (
    <div className="space-y-5">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="bg-black rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-sm text-white/50">Panel de control</p>
            <h2 className="text-2xl font-bold">VitalGym</h2>
          </div>
          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center shrink-0">
            <Users size={18} className="text-white/60" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl font-bold leading-none">{totalClients ?? 0}</p>
            <p className="text-[11px] text-white/50 mt-1 leading-tight">Clientes</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl font-bold leading-none">{todayBookings ?? 0}</p>
            <p className="text-[11px] text-white/50 mt-1 leading-tight">Clases hoy</p>
          </div>
        </div>
      </div>

      {/* ── Vista Hoy ────────────────────────────────────────── */}
      <TodayPanel entries={todayEntries} />

      {/* ── Alerta pagos ──────────────────────────────────────── */}
      {pendingPay > 0 && (
        <div className="bg-white rounded-2xl border border-brand/30 shadow-sm p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-[10px] font-bold text-brand uppercase tracking-widest">
                Pagos por cobrar
              </p>
              <p className="text-base font-bold text-gray-900 mt-1">
                {pendingPay} pago{pendingPay !== 1 ? 's' : ''} pendiente{pendingPay !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="w-11 h-11 bg-brand/10 rounded-2xl flex items-center justify-center shrink-0">
              <CreditCard className="text-brand" size={20} />
            </div>
          </div>
          <Link
            href="/admin/payments"
            className="mt-4 w-full flex items-center justify-center bg-black text-white
                       text-sm font-semibold py-2.5 rounded-xl"
          >
            Ver pagos
          </Link>
        </div>
      )}

      {/* ── Gestión rápida ────────────────────────────────────── */}
      <div>
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
          Gestión
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map(({ href, icon: Icon, label, description, accent }) => (
            <Link
              key={href}
              href={href}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
                <span>Abrir</span>
                <ChevronRight size={11} />
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
