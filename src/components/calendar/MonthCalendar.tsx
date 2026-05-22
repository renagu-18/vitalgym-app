'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X, Loader2, CalendarDays } from 'lucide-react'
import { requestBooking, cancelBooking } from '@/app/calendar/actions'
import type { TimeBlock, Booking } from '@/types/database'

type BlockStatus =
  | 'available' | 'full' | 'past' | 'too-soon'
  | 'my-pending' | 'my-approved' | 'my-rejected'

interface Props {
  timeBlocks: TimeBlock[]
  myBookings: Pick<Booking, 'id' | 'time_block_id' | 'status'>[]
  month: string   // YYYY-MM
  todayKey: string // YYYY-MM-DD
  serverNow: string
}

const TZ = 'America/Santiago'
const DAY_ABBREVS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false,
  })
}

function buildGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const startWeekday = (firstDay.getDay() + 6) % 7 // Mon=0 … Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: { key: string; day: number; inMonth: boolean }[] = []

  for (let i = startWeekday; i > 0; i--) {
    const d = new Date(year, month, 1 - i)
    cells.push({ key: d.toLocaleDateString('en-CA'), day: d.getDate(), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    cells.push({ key: date.toLocaleDateString('en-CA'), day: d, inMonth: true })
  }
  let next = 1
  while (cells.length % 7 !== 0) {
    const date = new Date(year, month + 1, next++)
    cells.push({ key: date.toLocaleDateString('en-CA'), day: date.getDate(), inMonth: false })
  }
  return cells
}

function getBlockStatus(
  block: TimeBlock,
  bookingMap: Map<string, Pick<Booking, 'id' | 'time_block_id' | 'status'>>,
  now: Date,
): BlockStatus {
  const bk = bookingMap.get(block.id)
  if (bk?.status === 'pending') return 'my-pending'
  if (bk?.status === 'approved') return 'my-approved'
  if (bk?.status === 'rejected') return 'my-rejected'
  const start = new Date(block.start_time)
  if (start <= now) return 'past'
  if ((start.getTime() - now.getTime()) / 3_600_000 < 12) return 'too-soon'
  if (block.current_count >= block.max_capacity) return 'full'
  return 'available'
}

function getDayDot(
  blocks: TimeBlock[],
  bookingMap: Map<string, Pick<Booking, 'id' | 'time_block_id' | 'status'>>,
  now: Date,
): 'approved' | 'pending' | 'available' | null {
  let hasPending = false
  let hasAvailable = false
  for (const block of blocks) {
    const bk = bookingMap.get(block.id)
    if (bk?.status === 'approved') return 'approved'
    if (bk?.status === 'pending') hasPending = true
    if (!bk) {
      const start = new Date(block.start_time)
      const hrs = (start.getTime() - now.getTime()) / 3_600_000
      if (start > now && hrs >= 12 && block.current_count < block.max_capacity) hasAvailable = true
    }
  }
  if (hasPending) return 'pending'
  if (hasAvailable) return 'available'
  return null
}

export default function MonthCalendar({ timeBlocks, myBookings, month, todayKey, serverNow }: Props) {
  const router = useRouter()
  const [navPending, startNav] = useTransition()
  const defaultDay = todayKey.startsWith(month) ? todayKey : null
  const [selectedDay, setSelectedDay] = useState<string | null>(defaultDay)
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const now = new Date(serverNow)
  const bookingMap = new Map(myBookings.map(b => [b.time_block_id, b]))
  const [year, monthNum] = month.split('-').map(Number)
  const monthIndex = monthNum - 1
  const cells = buildGrid(year, monthIndex)

  const blocksByDay = new Map<string, TimeBlock[]>()
  for (const block of timeBlocks) {
    const k = dayKey(block.start_time)
    const arr = blocksByDay.get(k) ?? []
    arr.push(block)
    blocksByDay.set(k, arr)
  }

  const selectedDayBlocks = selectedDay ? (blocksByDay.get(selectedDay) ?? []) : []

  function navigateMonth(delta: number) {
    let y = year, m = monthIndex + delta
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    startNav(() => router.push(`/calendar?month=${y}-${String(m + 1).padStart(2, '0')}`))
  }

  async function handleBook(block: TimeBlock) {
    setErrorMsg(null)
    setLoadingId(block.id)
    const res = await requestBooking(block.id)
    setLoadingId(null)
    if (res?.error) { setErrorMsg(res.error); return }
    setSelectedBlock(null)
    router.refresh()
  }

  async function handleCancel(bookingId: string) {
    setErrorMsg(null)
    setLoadingId(bookingId)
    const res = await cancelBooking(bookingId)
    setLoadingId(null)
    if (res?.error) { setErrorMsg(res.error); return }
    router.refresh()
  }

  const selectedDateObj = selectedDay ? new Date(selectedDay + 'T12:00:00') : null

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Reservar clase</h2>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <p className="text-sm text-red-700 flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)}>
            <X size={14} className="text-red-400 mt-0.5" />
          </button>
        </div>
      )}

      {/* ── Calendar card ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Month header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-50">
          <button
            onClick={() => navigateMonth(-1)}
            disabled={navPending}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          {navPending
            ? <Loader2 size={18} className="animate-spin text-gray-400" />
            : (
              <div className="text-center">
                <p className="text-base font-bold text-gray-900">{MONTH_NAMES[monthIndex]}</p>
                <p className="text-xs text-gray-400 font-medium">{year}</p>
              </div>
            )
          }

          <button
            onClick={() => navigateMonth(1)}
            disabled={navPending}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="px-3 pb-4 pt-3">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAY_ABBREVS.map(d => (
              <p key={d} className="text-center text-[11px] font-semibold text-gray-400">{d}</p>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {cells.map(({ key, day, inMonth }) => {
              const isToday = key === todayKey
              const isSelected = key === selectedDay
              const dayBlocks = blocksByDay.get(key)
              const dot = dayBlocks ? getDayDot(dayBlocks, bookingMap, now) : null
              const isPast = key < todayKey

              return (
                <button
                  key={key}
                  onClick={() => { setSelectedDay(key); setErrorMsg(null) }}
                  className="flex flex-col items-center py-0.5"
                >
                  <span className={[
                    'w-9 h-9 flex items-center justify-center rounded-full text-sm transition-all',
                    isSelected
                      ? 'bg-brand text-white font-bold shadow-md shadow-brand/30'
                      : isToday
                        ? 'border-2 border-brand text-brand font-bold'
                        : !inMonth
                          ? 'text-gray-200'
                          : isPast
                            ? 'text-gray-300'
                            : 'text-gray-800 hover:bg-gray-100 font-medium',
                  ].join(' ')}>
                    {day}
                  </span>
                  <span className={[
                    'w-1.5 h-1.5 rounded-full mt-0.5',
                    isSelected ? 'opacity-0' :
                    dot === 'approved' ? 'bg-blue-500' :
                    dot === 'pending'  ? 'bg-amber-400' :
                    dot === 'available' ? 'bg-brand' :
                    'opacity-0',
                  ].join(' ')} />
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-gray-50">
            {[
              { dot: 'bg-brand',      label: 'Disponible' },
              { dot: 'bg-amber-400',  label: 'Pendiente' },
              { dot: 'bg-blue-500',   label: 'Confirmada' },
            ].map(({ dot, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                <span className="text-[10px] text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Selected day slots ──────────────────────────────────── */}
      {selectedDateObj && (
        <div className="space-y-3">
          {/* Day label */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand flex flex-col items-center justify-center shadow-md shadow-brand/25">
              <span className="text-lg font-black text-white leading-none">{selectedDateObj.getDate()}</span>
              <span className="text-[9px] text-white/80 uppercase tracking-wide font-semibold">
                {selectedDateObj.toLocaleDateString('es-CL', { weekday: 'short' })}
              </span>
            </div>
            <div>
              <p className="text-base font-bold text-gray-900 capitalize">
                {selectedDateObj.toLocaleDateString('es-CL', { weekday: 'long' })}
              </p>
              <p className="text-xs text-gray-400 capitalize">
                {selectedDateObj.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          {selectedDayBlocks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <CalendarDays size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No hay clases programadas para este día.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedDayBlocks.map(block => {
                const status = getBlockStatus(block, bookingMap, now)
                const myBk = bookingMap.get(block.id)
                const spots = block.max_capacity - block.current_count
                const isLoading = loadingId === block.id || loadingId === myBk?.id
                return (
                  <SlotCard
                    key={block.id}
                    block={block}
                    status={status}
                    spots={spots}
                    isLoading={isLoading}
                    onBook={() => setSelectedBlock(block)}
                    onCancel={myBk ? () => handleCancel(myBk.id) : undefined}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Booking confirmation modal ──────────────────────────── */}
      {selectedBlock && (
        <BookingModal
          block={selectedBlock}
          isLoading={loadingId === selectedBlock.id}
          onConfirm={() => handleBook(selectedBlock)}
          onClose={() => setSelectedBlock(null)}
        />
      )}
    </div>
  )
}

// ─── SlotCard ─────────────────────────────────────────────────────────────────

const SLOT_STYLE: Record<BlockStatus, {
  border: string
  bg: string
  badge: string
  badgeText: string
  label: string
}> = {
  available:    { border: 'border-l-brand',    bg: 'bg-white',       badge: 'bg-green-50 text-green-700',  badgeText: 'Disponible',     label: '' },
  full:         { border: 'border-l-gray-200', bg: 'bg-gray-50',     badge: 'bg-gray-100 text-gray-400',   badgeText: 'Sin cupos',      label: '' },
  past:         { border: 'border-l-gray-200', bg: 'bg-gray-50',     badge: 'bg-gray-100 text-gray-400',   badgeText: 'Pasado',         label: '' },
  'too-soon':   { border: 'border-l-gray-200', bg: 'bg-gray-50',     badge: 'bg-gray-100 text-gray-400',   badgeText: 'Muy pronto',     label: '' },
  'my-pending': { border: 'border-l-amber-400',bg: 'bg-amber-50/50', badge: 'bg-amber-50 text-amber-700',  badgeText: 'Pendiente',      label: '' },
  'my-approved':{ border: 'border-l-blue-500', bg: 'bg-blue-50/50',  badge: 'bg-blue-50 text-blue-700',    badgeText: 'Confirmada ✓',   label: '' },
  'my-rejected':{ border: 'border-l-red-300',  bg: 'bg-gray-50',     badge: 'bg-red-50 text-red-500',      badgeText: 'Rechazada',      label: '' },
}

function SlotCard({
  block, status, spots, isLoading, onBook, onCancel,
}: {
  block: TimeBlock
  status: BlockStatus
  spots: number
  isLoading: boolean
  onBook: () => void
  onCancel?: () => void
}) {
  const s = SLOT_STYLE[status]

  return (
    <div className={`border border-gray-100 border-l-4 ${s.border} ${s.bg} rounded-xl p-4 flex items-center justify-between gap-3 transition-all`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900">
          {fmtTime(block.start_time)}
          <span className="text-gray-400 font-normal mx-1">—</span>
          {fmtTime(block.end_time)}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>
            {status === 'available' ? `${spots} ${spots === 1 ? 'lugar' : 'lugares'}` : s.badgeText}
          </span>
        </div>
      </div>

      <div className="shrink-0">
        {status === 'available' && (
          <button
            onClick={onBook}
            disabled={isLoading}
            className="px-4 py-2 bg-brand text-white text-xs font-bold rounded-xl hover:bg-brand-dark disabled:opacity-50 transition-colors shadow-sm shadow-brand/20"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Reservar'}
          </button>
        )}
        {(status === 'my-pending' || status === 'my-approved') && onCancel && (
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-2 border border-gray-200 text-gray-400 text-xs font-medium rounded-xl hover:border-red-200 hover:text-red-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Cancelar'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── BookingModal ──────────────────────────────────────────────────────────────

function BookingModal({
  block, isLoading, onConfirm, onClose,
}: {
  block: TimeBlock
  isLoading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const dateLabel = new Date(block.start_time).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
        {/* Header strip */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />

        <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
          <CalendarDays size={22} className="text-brand" />
        </div>

        <h3 className="text-xl font-black text-gray-900 mb-1">Confirmar reserva</h3>
        <p className="text-sm text-gray-500 capitalize">{dateLabel}</p>
        <p className="text-base font-bold text-gray-900 mt-0.5">
          {fmtTime(block.start_time)} – {fmtTime(block.end_time)}
        </p>

        <p className="text-xs text-gray-400 mt-4 mb-6 leading-relaxed">
          Se descontará una clase de tu suscripción. Recibirás una notificación de confirmación.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Volver
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-3 bg-brand rounded-2xl text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand/25"
          >
            {isLoading
              ? <><Loader2 size={14} className="animate-spin" /> Reservando…</>
              : 'Confirmar'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
