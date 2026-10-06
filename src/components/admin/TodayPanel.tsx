'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Clock, Dumbbell, History, Loader2 } from 'lucide-react'
import RoutineEditor from '@/components/training/RoutineEditor'
import { setBookingAttendance, returnClass } from '@/app/admin/classes/actions'
import type { RefundReason } from '@/lib/class-adjustments'

const TZ = 'America/Santiago'

interface ExerciseData {
  id: string
  name: string
  sets: number | null
  reps: string | null
  suggested_weight: string | null
  notes: string | null
  order_index: number
}

interface LastSessionExercise {
  id: string
  exercise_name: string
  sets_done: number | null
  reps_done: string | null
  weight_used: string | null
  notes: string | null
}

export interface TodayEntry {
  bookingId: string
  /** approved/completed = asistió (o asistirá); no_show = no vino; cancelled_late = canceló con < 4 h. Los dos últimos descuentan. */
  status: 'approved' | 'completed' | 'no_show' | 'cancelled_late'
  /** ya tuvo una devolución de clase (ajuste +1 ligado a la reserva) */
  refunded: boolean
  blockStart: string
  blockEnd: string
  client: { id: string; full_name: string }
  allRoutines: { id: string; name: string; is_active: boolean }[]
  routine: {
    id: string
    name: string
    description: string | null
    exercises: ExerciseData[]
  } | null
  lastSessions: {
    date: string
    notes: string | null
    exercises: LastSessionExercise[]
  }[]
}

interface Props {
  entries: TodayEntry[]
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false,
  })
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default function TodayPanel({ entries }: Props) {
  const [selected, setSelected] = useState<TodayEntry | null>(null)
  const [tab, setTab] = useState<'routine' | 'history'>('routine')

  function openClient(entry: TodayEntry) {
    setSelected(entry)
    setTab('routine')
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">Hoy</p>
        {entries.length > 0 && (
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            {entries.length} clase{entries.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-gray-400">No hay clases confirmadas para hoy.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {entries.map(entry => (
            <div key={entry.bookingId} className="px-4 py-3">
              <button
                onClick={() => openClient(entry)}
                className="w-full flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 tabular-nums shrink-0 w-24">
                  <Clock size={12} className="text-gray-300" />
                  {fmtTime(entry.blockStart)}–{fmtTime(entry.blockEnd)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{entry.client.full_name}</p>
                  <p className={`text-xs mt-0.5 truncate ${entry.routine ? 'text-gray-500' : 'text-gray-300'}`}>
                    {entry.routine ? entry.routine.name : 'Sin rutina asignada'}
                  </p>
                </div>
                {entry.status === 'no_show' && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">No vino</span>
                )}
                {entry.status === 'cancelled_late' && (
                  <span className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">Canceló tarde</span>
                )}
              </button>
              <AttendanceActions entry={entry} />
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setSelected(null)}
        >
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg mx-auto shadow-2xl
                          max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-start justify-between border-b border-gray-50 shrink-0">
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 truncate">{selected.client.full_name}</p>
                <p className="text-xs text-gray-400">
                  {fmtTime(selected.blockStart)}–{fmtTime(selected.blockEnd)} hoy
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mx-5 mt-3 shrink-0">
              <button
                onClick={() => setTab('routine')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-colors
                  ${tab === 'routine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Dumbbell size={13} /> Rutina de hoy
              </button>
              <button
                onClick={() => setTab('history')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-colors
                  ${tab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <History size={13} /> Últimas sesiones
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto">
              {tab === 'routine' ? (
                <RoutineEditor
                  clientId={selected.client.id}
                  activeRoutine={selected.routine}
                  allRoutines={selected.allRoutines}
                />
              ) : (
                <LastSessionsView sessions={selected.lastSessions} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Botones de asistencia de una clase. "No vino" pide una confirmación mínima (segundo toque) y
// después ofrece "Deshacer". Funciona igual si el cron ya la había pasado a completed.
function AttendanceActions({ entry }: { entry: TodayEntry }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [choosingRefund, setChoosingRefund] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<{ error?: string | null }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) { setError(res.error); return }
      setConfirming(false)
      setChoosingRefund(false)
      router.refresh()
    })
  }

  const btn = 'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50'
  const spinner = isPending && <Loader2 size={12} className="animate-spin" />

  return (
    <div className="mt-2 pl-[6.75rem] space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {(entry.status === 'approved' || entry.status === 'completed') && (
          confirming ? (
            <>
              <span className="text-xs text-gray-500">¿No vino? Se descuenta la clase.</span>
              <button disabled={isPending} onClick={() => run(() => setBookingAttendance(entry.bookingId, 'no_show'))}
                className={`${btn} bg-black text-white border-black flex items-center gap-1`}>{spinner}Sí</button>
              <button disabled={isPending} onClick={() => setConfirming(false)}
                className={`${btn} border-gray-200 text-gray-600`}>No</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className={`${btn} border-gray-200 text-gray-600 hover:border-gray-400`}>
              No vino
            </button>
          )
        )}

        {entry.status === 'no_show' && (
          <button disabled={isPending} onClick={() => run(() => setBookingAttendance(entry.bookingId, 'present'))}
            className={`${btn} border-gray-200 text-gray-600 hover:border-gray-400 flex items-center gap-1`}>
            {spinner}Deshacer
          </button>
        )}

        {(entry.status === 'no_show' || entry.status === 'cancelled_late') && (
          entry.refunded ? (
            <span className="text-xs text-green-700">Clase devuelta</span>
          ) : choosingRefund ? (
            <>
              <span className="text-xs text-gray-500">Devolver por:</span>
              {(['reagendada', 'excepción'] as RefundReason[]).map(r => (
                <button key={r} disabled={isPending} onClick={() => run(() => returnClass(entry.bookingId, r))}
                  className={`${btn} border-gray-200 text-gray-700 hover:border-gray-400 capitalize flex items-center gap-1`}>
                  {spinner}{r}
                </button>
              ))}
              <button disabled={isPending} onClick={() => setChoosingRefund(false)} className="text-xs text-gray-400">Cancelar</button>
            </>
          ) : (
            <button onClick={() => setChoosingRefund(true)} className={`${btn} border-brand/40 text-brand hover:bg-brand/5`}>
              Devolver clase
            </button>
          )
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function LastSessionsView({ sessions }: { sessions: TodayEntry['lastSessions'] }) {
  if (sessions.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">Aún no hay sesiones registradas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-sm font-semibold text-gray-900 capitalize">{fmtDate(session.date)}</p>
          </div>
          {session.exercises.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {session.exercises.map(ex => (
                <div key={ex.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <p className="text-sm text-gray-700 font-medium flex-1 min-w-0 truncate">{ex.exercise_name}</p>
                  <p className="text-xs text-gray-400 flex-shrink-0 text-right">
                    {[
                      ex.sets_done && `${ex.sets_done} series`,
                      ex.reps_done && `× ${ex.reps_done}`,
                      ex.weight_used && `· ${ex.weight_used}`,
                    ].filter(Boolean).join(' ') || '—'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-gray-400">Sin ejercicios registrados en esa sesión.</p>
          )}
          {session.notes && (
            <p className="px-4 py-2 text-xs text-gray-400 italic border-t border-gray-50">{session.notes}</p>
          )}
        </div>
      ))}
    </div>
  )
}
