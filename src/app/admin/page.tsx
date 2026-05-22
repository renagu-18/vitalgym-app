import { createClient } from '@/lib/supabase/server'
import { Users, CalendarDays, Dumbbell, Ruler, CreditCard, ChevronRight } from 'lucide-react'
import Link from 'next/link'

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
