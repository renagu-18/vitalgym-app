'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays } from 'lucide-react'
import type { BlockData } from '@/app/admin/bookings/page'

const TZ = 'America/Santiago'

interface Props {
  blocks: BlockData[]
  weekOffset: number
  mondayISO: string
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false,
  })
}

function getDayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}

function getDayLabel(dateKey: string) {
  return new Date(dateKey + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
  })
}

function getWeekLabel(mondayISO: string) {
  const monday = new Date(mondayISO)
  const saturday = new Date(mondayISO)
  saturday.setUTCDate(monday.getUTCDate() + 5)

  const fmt = (d: Date) => d.toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', timeZone: TZ,
  })
  return `${fmt(monday)} – ${fmt(saturday)}`
}

function weekLabel(weekOffset: number) {
  if (weekOffset === 0) return 'Esta semana'
  if (weekOffset === 1) return 'Próxima semana'
  if (weekOffset === -1) return 'Semana pasada'
  return weekOffset > 0 ? `+${weekOffset} semanas` : `${weekOffset} semanas`
}

export default function WeeklyCalendar({ blocks, weekOffset, mondayISO }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  // Group blocks by Santiago date
  const dayMap = new Map<string, BlockData[]>()
  for (const block of blocks) {
    const key = getDayKey(block.start_time)
    const list = dayMap.get(key) ?? []
    list.push(block)
    dayMap.set(key, list)
  }
  const days = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-5">

      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reservas</h2>
        <p className="text-sm text-gray-500 mt-1">Vista semanal de clases confirmadas</p>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/admin/bookings?week=${weekOffset - 1}`}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:border-gray-300 transition-colors shrink-0"
        >
          <ChevronLeft size={18} className="text-gray-600" />
        </Link>
        <div className="text-center min-w-0">
          <p className="text-[11px] text-gray-400 font-medium">{weekLabel(weekOffset)}</p>
          <p className="text-sm font-semibold text-gray-900">{getWeekLabel(mondayISO)}</p>
        </div>
        <Link
          href={`/admin/bookings?week=${weekOffset + 1}`}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:border-gray-300 transition-colors shrink-0"
        >
          <ChevronRight size={18} className="text-gray-600" />
        </Link>
      </div>

      {/* Calendar */}
      {days.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <CalendarDays size={28} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No hay bloques horarios esta semana</p>
          <p className="text-xs text-gray-400 mt-1">Genera bloques desde la sección Calendario</p>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map(([dayKey, dayBlocks]) => {
            const totalClients = dayBlocks.reduce((s, b) => s + b.clients.length, 0)
            return (
              <div key={dayKey}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest capitalize">
                    {getDayLabel(dayKey)}
                  </p>
                  {totalClients > 0 && (
                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {totalClients} reserva{totalClients !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Blocks grid */}
                <div className="space-y-1.5">
                  {dayBlocks.map(block => {
                    const hasClients = block.clients.length > 0
                    const isFull = block.current_count >= block.max_capacity
                    const isExpanded = expanded === block.id

                    return (
                      <div
                        key={block.id}
                        className={`rounded-xl border overflow-hidden transition-all
                          ${hasClients
                            ? 'bg-white border-gray-200 shadow-sm'
                            : 'bg-gray-50 border-gray-100'
                          }`}
                      >
                        {/* Block row */}
                        <button
                          onClick={() => hasClients && setExpanded(isExpanded ? null : block.id)}
                          disabled={!hasClients}
                          className="w-full px-4 py-2.5 flex items-center justify-between gap-3"
                        >
                          <span className={`text-sm font-semibold tabular-nums
                            ${hasClients ? 'text-gray-900' : 'text-gray-400'}`}>
                            {fmtTime(block.start_time)} – {fmtTime(block.end_time)}
                          </span>

                          <div className="flex items-center gap-2">
                            {/* Capacity badge */}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                              ${isFull
                                ? 'bg-red-50 text-red-600'
                                : hasClients
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-gray-100 text-gray-400'
                              }`}>
                              {block.current_count}/{block.max_capacity}
                            </span>

                            {/* Client names preview (collapsed) */}
                            {hasClients && !isExpanded && (
                              <span className="text-xs text-gray-500 truncate max-w-[100px]">
                                {block.clients.map(c => c.full_name.split(' ')[0]).join(', ')}
                              </span>
                            )}

                            {hasClients && (
                              <ChevronDown
                                size={14}
                                className={`text-gray-400 transition-transform shrink-0
                                  ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            )}
                          </div>
                        </button>

                        {/* Expanded client list */}
                        {isExpanded && (
                          <div className="px-4 pb-3 pt-1 border-t border-gray-100 space-y-2">
                            {block.clients.map(client => (
                              <Link
                                key={client.id}
                                href={`/admin/clients/${client.id}`}
                                className="flex items-center gap-2.5 hover:opacity-75 transition-opacity"
                              >
                                <div className="w-7 h-7 rounded-full bg-brand text-white
                                               flex items-center justify-center text-xs font-bold shrink-0">
                                  {client.full_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm text-gray-800">{client.full_name}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
