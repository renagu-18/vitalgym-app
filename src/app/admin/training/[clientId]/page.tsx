import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ArrowLeft, Pencil } from 'lucide-react'
import RoutineEditor from '@/components/training/RoutineEditor'
import TrainingLogForm, { type EditableLog } from '@/components/training/TrainingLogForm'
import DeleteLogButton from '@/components/training/DeleteLogButton'
import { formatPeso } from '@/lib/peso'

const TZ = 'America/Santiago'

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

type Tab = 'routine' | 'log' | 'history'

export default async function ClientTrainingPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ tab?: string; edit?: string }>
}) {
  const { clientId } = await params
  const { tab = 'routine', edit } = await searchParams
  const activeTab = (tab as Tab) || 'routine'

  const supabase = await createClient()

  // Datos del cliente
  const { data: client } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', clientId)
    .eq('role', 'client')
    .single()

  if (!client) notFound()

  // Todas las rutinas del cliente
  const { data: routines } = await supabase
    .from('routines')
    .select('id, name, is_active, description')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  const activeRoutine = routines?.find(r => r.is_active) ?? null

  // Ejercicios de la rutina activa
  const { data: exercises } = activeRoutine
    ? await supabase
        .from('exercises')
        .select('*')
        .eq('routine_id', activeRoutine.id)
        .order('order_index')
    : { data: [] }

  const activeRoutineFull = activeRoutine
    ? { ...activeRoutine, exercises: exercises ?? [] }
    : null

  // Historial de entrenamientos
  const { data: logs } = await supabase
    .from('training_logs')
    .select(`
      id, log_date, notes,
      exercise_logs(id, exercise_name, sets_done, reps_done, weight_used, notes)
    `)
    .eq('client_id', clientId)
    .order('log_date', { ascending: false })
    .limit(30)

  // Sesión a editar (?tab=log&edit=<logId>), desde el historial o la ficha de TodayPanel
  const { data: editLogData } = activeTab === 'log' && edit
    ? await supabase
        .from('training_logs')
        .select(`
          id, log_date, notes,
          exercise_logs(id, exercise_id, exercise_name, sets_done, reps_done, weight_used, notes)
        `)
        .eq('id', edit)
        .eq('client_id', clientId)
        .maybeSingle()
    : { data: null }
  const editLog = editLogData as EditableLog | null
  if (edit && activeTab === 'log' && !editLog) notFound()

  const tabs: { id: Tab; label: string }[] = [
    { id: 'routine', label: 'Rutina' },
    { id: 'log', label: editLog ? 'Editar sesión' : 'Registrar sesión' },
    { id: 'history', label: 'Historial' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/admin/training"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft size={14} /> Clientes
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">{client.full_name}</h2>
        <p className="text-sm text-gray-500">Entrenamiento</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {tabs.map(t => (
          <Link
            key={t.id}
            href={`/admin/training/${clientId}?tab=${t.id}`}
            className={`flex-1 text-center text-xs font-semibold py-2 rounded-lg transition-colors
              ${activeTab === t.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── Tab: Rutina ── */}
      {activeTab === 'routine' && (
        <RoutineEditor
          clientId={clientId}
          activeRoutine={activeRoutineFull}
          allRoutines={routines ?? []}
        />
      )}

      {/* ── Tab: Registrar sesión ── */}
      {activeTab === 'log' && (
        <div className="space-y-3">
          {editLog && (
            <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <p className="text-sm text-amber-800">
                Editando la sesión del <span className="font-semibold">{fmtDate(editLog.log_date)}</span>
              </p>
              <Link href={`/admin/training/${clientId}?tab=history`} className="text-xs text-amber-700 underline shrink-0">
                Cancelar
              </Link>
            </div>
          )}
          <TrainingLogForm
            key={editLog?.id ?? 'new'}
            clientId={clientId}
            routineId={activeRoutine?.id ?? null}
            routineExercises={exercises ?? []}
            editLog={editLog}
          />
        </div>
      )}

      {/* ── Tab: Historial ── */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {(!logs || logs.length === 0) ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-400">Aún no hay sesiones registradas.</p>
            </div>
          ) : (
            logs.map(log => {
              type ExLog = {
                id: string
                exercise_name: string
                sets_done: number | null
                reps_done: string | null
                weight_used: string | null
                notes: string | null
              }
              const exLogs = (log.exercise_logs ?? []) as ExLog[]

              return (
                <div key={log.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                    <p className="text-sm font-semibold text-gray-900 capitalize">{fmtDate(log.log_date)}</p>
                    <div className="flex items-center gap-0.5">
                      <Link
                        href={`/admin/training/${clientId}?tab=log&edit=${log.id}`}
                        aria-label="Editar sesión"
                        className="p-1.5 text-gray-300 hover:text-gray-600 transition-colors"
                      >
                        <Pencil size={14} />
                      </Link>
                      <DeleteLogButton logId={log.id} clientId={clientId} />
                    </div>
                  </div>

                  {exLogs.length > 0 && (
                    <div className="divide-y divide-gray-50">
                      {exLogs.map(ex => (
                        <div key={ex.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                          <p className="text-sm text-gray-700 font-medium flex-1 min-w-0 truncate">
                            {ex.exercise_name}
                          </p>
                          <p className="text-xs text-gray-400 flex-shrink-0 text-right">
                            {[
                              ex.sets_done && `${ex.sets_done} series`,
                              ex.reps_done && `× ${ex.reps_done}`,
                              ex.weight_used && `· ${formatPeso(ex.weight_used)}`,
                            ].filter(Boolean).join(' ') || '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {log.notes && (
                    <p className="px-4 py-2 text-xs text-gray-400 italic border-t border-gray-50">
                      {log.notes}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
