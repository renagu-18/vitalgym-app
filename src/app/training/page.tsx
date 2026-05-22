import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Dumbbell, ChevronDown } from 'lucide-react'
import ProgressSection from '@/components/training/ProgressSection'

export default async function TrainingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Rutina activa con ejercicios
  const { data: routines } = await supabase
    .from('routines')
    .select('id, name, description')
    .eq('client_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const activeRoutine = routines?.[0] ?? null

  const { data: exercises } = activeRoutine
    ? await supabase
        .from('exercises')
        .select('*')
        .eq('routine_id', activeRoutine.id)
        .order('order_index')
    : { data: [] }

  // Historial de sesiones (últimas 20)
  const { data: logs } = await supabase
    .from('training_logs')
    .select(`
      id, log_date, notes,
      exercise_logs(id, exercise_name, sets_done, reps_done, weight_used)
    `)
    .eq('client_id', user.id)
    .order('log_date', { ascending: false })
    .limit(20)

  type ExLog = {
    id: string
    exercise_name: string
    sets_done: number | null
    reps_done: string | null
    weight_used: string | null
  }

  type LogRow = {
    id: string
    log_date: string
    notes: string | null
    exercise_logs: ExLog[]
  }

  const logRows = (logs ?? []) as LogRow[]

  // Construir datos de progreso por ejercicio
  // Agrupa por exercise_name → lista de {date, weight}
  const progressMap: Record<string, { date: string; weight: number }[]> = {}
  for (const log of logRows) {
    for (const ex of log.exercise_logs) {
      if (!ex.weight_used) continue
      const kg = parseFloat(ex.weight_used.replace(/[^0-9.]/g, ''))
      if (isNaN(kg) || kg <= 0) continue
      ;(progressMap[ex.exercise_name] ??= []).push({ date: log.log_date, weight: kg })
    }
  }
  // Ordenar por fecha asc y tomar hasta 8 puntos
  const progressData = Object.entries(progressMap)
    .filter(([, pts]) => pts.length >= 2)
    .map(([name, pts]) => ({
      name,
      points: pts.sort((a, b) => a.date.localeCompare(b.date)).slice(-8),
    }))

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Mi entrenamiento</h2>

      {/* ── Rutina activa ── */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Rutina actual
        </h3>

        {!activeRoutine ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
            <Dumbbell size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Tu entrenador aún no te ha asignado una rutina.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-900">{activeRoutine.name}</p>
              {activeRoutine.description && (
                <p className="text-xs text-gray-500 mt-0.5">{activeRoutine.description}</p>
              )}
            </div>
            {(!exercises || exercises.length === 0) ? (
              <p className="px-4 py-4 text-sm text-gray-400">Sin ejercicios asignados aún.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {exercises.map((ex, idx) => (
                  <div key={ex.id} className="px-4 py-3 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold
                                     flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{ex.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[
                          ex.sets && `${ex.sets} series`,
                          ex.reps && `× ${ex.reps} reps`,
                          ex.suggested_weight && `· ${ex.suggested_weight}`,
                        ].filter(Boolean).join(' ')}
                      </p>
                      {ex.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{ex.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Progreso ── */}
      {progressData.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Progreso de pesos
          </h3>
          <ProgressSection progressData={progressData} />
        </section>
      )}

      {/* ── Historial ── */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Historial de sesiones
        </h3>

        {logRows.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-400">Aún no hay sesiones registradas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logRows.map(log => (
              <details key={log.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden group">
                <summary className="px-4 py-3 flex items-center justify-between cursor-pointer list-none">
                  <p className="text-sm font-semibold text-gray-900 capitalize">
                    {new Date(log.log_date + 'T12:00:00').toLocaleDateString('es-CL', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{log.exercise_logs.length} ejercicios</span>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </div>
                </summary>

                <div className="border-t border-gray-50 divide-y divide-gray-50">
                  {log.exercise_logs.map(ex => (
                    <div key={ex.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                      <p className="text-sm text-gray-700 flex-1 min-w-0 truncate">{ex.exercise_name}</p>
                      <p className="text-xs text-gray-400 flex-shrink-0 text-right">
                        {[
                          ex.sets_done && `${ex.sets_done}×`,
                          ex.reps_done,
                          ex.weight_used && `· ${ex.weight_used}`,
                        ].filter(Boolean).join(' ') || '—'}
                      </p>
                    </div>
                  ))}
                  {log.notes && (
                    <p className="px-4 py-2 text-xs text-gray-400 italic">{log.notes}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
