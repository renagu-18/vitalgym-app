'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Check } from 'lucide-react'
import { createTrainingLog, type ExerciseLogInput } from '@/app/admin/training/[clientId]/actions'

interface RoutineExercise {
  id: string
  name: string
  sets: number | null
  reps: string | null
  suggested_weight: string | null
}

interface Props {
  clientId: string
  routineId: string | null
  routineExercises: RoutineExercise[]
  onSuccess?: () => void
}

interface LogRow extends ExerciseLogInput {
  _key: string
}

function makeRow(ex?: RoutineExercise): LogRow {
  return {
    _key: Math.random().toString(36).slice(2),
    exerciseId: ex?.id ?? null,
    exerciseName: ex?.name ?? '',
    setsDone: ex?.sets ?? null,
    repsDone: ex?.reps ?? '',
    weightUsed: ex?.suggested_weight ?? '',
    notes: null,
  }
}

export default function TrainingLogForm({ clientId, routineId, routineExercises, onSuccess }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const [logDate, setLogDate] = useState(today)
  const [sessionNotes, setSessionNotes] = useState('')
  const [rows, setRows] = useState<LogRow[]>(() =>
    routineExercises.length > 0
      ? routineExercises.map(ex => makeRow(ex))
      : [makeRow()]
  )

  function updateRow(key: string, patch: Partial<LogRow>) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, ...patch } : r))
  }

  function removeRow(key: string) {
    setRows(prev => prev.filter(r => r._key !== key))
  }

  function addExtraRow() {
    setRows(prev => [...prev, makeRow()])
  }

  function handleSubmit() {
    const validRows = rows.filter(r => r.exerciseName.trim())
    if (validRows.length === 0) { setError('Agrega al menos un ejercicio'); return }

    setError(null)
    startTransition(async () => {
      const res = await createTrainingLog({
        clientId,
        logDate,
        routineId,
        notes: sessionNotes.trim() || null,
        exercises: validRows,
      })
      if (res?.error) { setError(res.error); return }
      setSuccess(true)
      router.refresh()
      onSuccess?.()
    })
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-3">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Check size={20} className="text-green-600" />
        </div>
        <p className="text-sm font-semibold text-green-800">Sesión registrada correctamente</p>
        <button
          onClick={() => {
            setSuccess(false)
            setLogDate(today)
            setSessionNotes('')
            setRows(routineExercises.length > 0 ? routineExercises.map(ex => makeRow(ex)) : [makeRow()])
          }}
          className="text-sm text-green-700 underline"
        >
          Registrar otra sesión
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Fecha */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Fecha de la sesión
        </label>
        <input
          type="date"
          value={logDate}
          max={today}
          onChange={e => setLogDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Ejercicios */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Ejercicios realizados
        </label>
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row._key} className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold
                                 flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={row.exerciseName}
                  onChange={e => updateRow(row._key, { exerciseName: e.target.value })}
                  placeholder="Ejercicio"
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <button
                  onClick={() => removeRow(row._key)}
                  className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Series</label>
                  <input
                    type="number"
                    min={1}
                    value={row.setsDone ?? ''}
                    onChange={e => updateRow(row._key, { setsDone: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="—"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Reps realizadas</label>
                  <input
                    type="text"
                    value={row.repsDone ?? ''}
                    onChange={e => updateRow(row._key, { repsDone: e.target.value })}
                    placeholder="—"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Peso usado</label>
                  <input
                    type="text"
                    value={row.weightUsed ?? ''}
                    onChange={e => updateRow(row._key, { weightUsed: e.target.value })}
                    placeholder="—"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              <input
                type="text"
                value={row.notes ?? ''}
                onChange={e => updateRow(row._key, { notes: e.target.value || null })}
                placeholder="Notas del ejercicio (opcional)"
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          ))}
        </div>

        <button
          onClick={addExtraRow}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 border border-dashed
                     border-gray-300 rounded-xl text-sm text-gray-500 hover:border-gray-400
                     hover:text-gray-700 transition-colors"
        >
          <Plus size={14} /> Agregar ejercicio
        </button>
      </div>

      {/* Notas de sesión */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Observaciones generales
        </label>
        <textarea
          value={sessionNotes}
          onChange={e => setSessionNotes(e.target.value)}
          rows={2}
          placeholder="Notas de la sesión (opcional)"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none
                     focus:outline-none focus:ring-2 focus:ring-brand placeholder:text-gray-400"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 py-3 bg-brand text-white
                   text-sm font-semibold rounded-xl hover:bg-brand-dark disabled:opacity-50
                   transition-colors"
      >
        {isPending
          ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
          : <><Check size={16} /> Guardar sesión</>
        }
      </button>
    </div>
  )
}
