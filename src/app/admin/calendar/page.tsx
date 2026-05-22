import { createClient } from '@/lib/supabase/server'
import { startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import Link from 'next/link'
import GenerateBlocksForm from '@/components/admin/GenerateBlocksForm'
import { ToggleBlockButton, DeleteBlockButton } from '@/components/admin/BlockToggleButton'

const TZ = 'America/Santiago'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false,
  })
}

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

function fmtDayLabel(dk: string) {
  return new Date(dk + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
  })
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const params = await searchParams
  const weekOffset = Math.max(-4, Math.min(12, parseInt(params.week ?? '0', 10) || 0))

  const supabase = await createClient()

  const nowSantiago = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  const base = addWeeks(nowSantiago, weekOffset)
  const weekStart = startOfWeek(base, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(base, { weekStartsOn: 1 })

  const { data: blocks } = await supabase
    .from('time_blocks')
    .select('*')
    .gte('start_time', weekStart.toISOString())
    .lte('start_time', weekEnd.toISOString())
    .order('start_time')

  // Conteo de reservas aprobadas por bloque
  const blockIds = (blocks ?? []).map(b => b.id)
  const { data: bookingCounts } = blockIds.length
    ? await supabase
        .from('bookings')
        .select('time_block_id')
        .in('time_block_id', blockIds)
        .eq('status', 'approved')
    : { data: [] }

  const countMap = new Map<string, number>()
  for (const b of bookingCounts ?? []) {
    countMap.set(b.time_block_id, (countMap.get(b.time_block_id) ?? 0) + 1)
  }

  // Agrupar por día
  const grouped: Record<string, typeof blocks> = {}
  for (const b of blocks ?? []) {
    const k = dayKey(b.start_time)
    ;(grouped[k] ??= []).push(b)
  }
  const days = Object.keys(grouped).sort()

  const weekLabel = (() => {
    const a = weekStart.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
    const b = weekEnd.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
    return `${a} – ${b}`
  })()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Calendario</h2>
        <p className="text-sm text-gray-500 mt-1">Gestiona los bloques horarios disponibles</p>
      </div>

      <GenerateBlocksForm />

      {/* Navegación de semana */}
      <div className="flex items-center justify-between">
        <Link
          href={`/admin/calendar?week=${weekOffset - 1}`}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={20} />
        </Link>
        <span className="text-sm font-medium text-gray-600">{weekLabel}</span>
        <Link
          href={`/admin/calendar?week=${weekOffset + 1}`}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronRight size={20} />
        </Link>
      </div>

      {days.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">No hay bloques para esta semana.</p>
          <p className="text-xs text-gray-400 mt-1">Usa el formulario de arriba para generarlos.</p>
        </div>
      ) : (
        days.map(dk => (
          <div key={dk}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 capitalize">
              {fmtDayLabel(dk)}
            </p>
            <div className="space-y-2">
              {(grouped[dk] ?? []).map(block => {
                const confirmed = countMap.get(block.id) ?? 0
                return (
                  <div
                    key={block.id}
                    className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-2
                      ${block.is_active ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-200 opacity-60'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${block.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {fmtTime(block.start_time)} – {fmtTime(block.end_time)}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Users size={11} className="text-gray-400" />
                          <p className="text-xs text-gray-400">
                            {confirmed}/{block.max_capacity} confirmados
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <ToggleBlockButton blockId={block.id} isActive={block.is_active} />
                      <DeleteBlockButton blockId={block.id} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
