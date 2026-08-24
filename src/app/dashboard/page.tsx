import { createClient } from '@/lib/supabase/server'
import { CalendarDays, Dumbbell, Ruler, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const [profileRes, subscriptionRes, nextBookingRes, monthlyBookingsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user!.id).single(),
    supabase
      .from('subscriptions')
      .select('classes_remaining, status, plans(name)')
      .eq('client_id', user!.id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('bookings')
      .select('time_blocks!inner(start_time, end_time)')
      .eq('client_id', user!.id)
      .eq('status', 'approved')
      .gte('time_blocks.start_time', now.toISOString())
      .order('time_blocks(start_time)', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bookings')
      .select('id, time_blocks!inner(start_time)')
      .eq('client_id', user!.id)
      .eq('status', 'approved')
      .gte('time_blocks.start_time', startOfMonth)
      .lte('time_blocks.start_time', endOfMonth),
  ])

  const profile = profileRes.data
  const subscription = subscriptionRes.data
  const nextBookingData = nextBookingRes.data
  const monthlyCount = monthlyBookingsRes.data?.length ?? 0

  const planName = (subscription?.plans as { name: string } | null)?.name
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Cliente'
  const initials = profile?.full_name
    ?.split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? 'CL'

  type TimeBlock = { start_time: string; end_time: string }
  const rawBlock = nextBookingData?.time_blocks
  const nextBlock: TimeBlock | null = rawBlock
    ? (Array.isArray(rawBlock) ? (rawBlock[0] ?? null) : (rawBlock as TimeBlock))
    : null
  const nextStart = nextBlock ? new Date(nextBlock.start_time) : null
  const nextEnd   = nextBlock ? new Date(nextBlock.end_time)   : null

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' })
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' })

  const quickCards = [
    {
      href: '/calendar',
      icon: CalendarDays,
      label: 'Reservar clase',
      description: 'Solicita un horario',
      cta: 'Ver disponibilidad',
      accent: 'bg-brand/10 text-brand',
    },
    {
      href: '/training',
      icon: Dumbbell,
      label: 'Mi rutina',
      description: 'Ejercicios del día',
      cta: 'Ver ejercicios',
      accent: 'bg-green-50 text-green-600',
    },
    {
      href: '/measurements',
      icon: Ruler,
      label: 'Mis medidas',
      description: 'Progreso corporal',
      cta: 'Ver progreso',
      accent: 'bg-purple-50 text-purple-600',
    },
  ]

  return (
    <div className="space-y-5">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="bg-brand rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-sm text-white/70">Bienvenido</p>
            <h2 className="text-2xl font-bold">{firstName}</h2>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
            {initials}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-2xl font-bold leading-none">
              {subscription?.classes_remaining ?? '—'}
            </p>
            <p className="text-[11px] text-white/70 mt-1 leading-tight">Clases restantes</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-2xl font-bold leading-none">{monthlyCount}</p>
            <p className="text-[11px] text-white/70 mt-1 leading-tight">Clases este mes</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-sm font-semibold leading-tight truncate">{planName ?? '—'}</p>
            <p className="text-[11px] text-white/70 mt-1 leading-tight">Plan activo</p>
          </div>
        </div>
      </div>

      {/* ── Sin suscripción ───────────────────────────────────── */}
      {!subscription && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800">Sin suscripción activa</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Contacta a tu entrenador para activar tu plan.
          </p>
        </div>
      )}

      {/* ── Próxima clase ─────────────────────────────────────── */}
      {nextStart && nextEnd && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Próxima clase
              </p>
              <p className="text-base font-bold text-gray-900 mt-1 capitalize">
                {fmtDate(nextStart)}
              </p>
              <p className="text-sm text-brand font-semibold mt-0.5">
                {fmtTime(nextStart)} – {fmtTime(nextEnd)}
              </p>
            </div>
            <div className="w-11 h-11 bg-brand/10 rounded-2xl flex items-center justify-center shrink-0">
              <CalendarDays className="text-brand" size={20} />
            </div>
          </div>
          <Link
            href="/calendar"
            className="mt-4 w-full flex items-center justify-center bg-black text-white
                       text-sm font-semibold py-2.5 rounded-xl"
          >
            Ver en calendario
          </Link>
        </div>
      )}

      {/* ── Acceso rápido ─────────────────────────────────────── */}
      <div>
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
          Acceso rápido
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {quickCards.map(({ href, icon: Icon, label, description, cta, accent }, i) =>
            i < 2 ? (
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
                  <span>{cta}</span>
                  <ChevronRight size={11} />
                </div>
              </Link>
            ) : (
              <Link
                key={href}
                href={href}
                className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4
                           flex items-center gap-4"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
                <ChevronRight size={16} className="text-gray-400 shrink-0" />
              </Link>
            )
          )}
        </div>
      </div>

    </div>
  )
}
