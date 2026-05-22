'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  createRoutine,
  updateRoutineMeta,
  activateRoutine,
  addExercise,
  updateExercise,
  deleteExercise,
} from '@/app/admin/training/[clientId]/actions'

interface ExerciseData {
  id: string
  name: string
  sets: number | null
  reps: string | null
  suggested_weight: string | null
  notes: string | null
  order_index: number
}

interface RoutineData {
  id: string
  name: string
  description: string | null
  exercises: ExerciseData[]
}

interface Props {
  clientId: string
  activeRoutine: RoutineData | null
  allRoutines: { id: string; name: string; is_active: boolean }[]
}

type EditingExercise = Omit<ExerciseData, 'id' | 'order_index'>

const emptyExercise = (): EditingExercise => ({
  name: '', sets: null, reps: '', suggested_weight: '', notes: '',
})

export default function RoutineEditor({ clientId, activeRoutine, allRoutines }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Crear rutina
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newRoutineName, setNewRoutineName] = useState('')

  // Editar nombre rutina
  const [editingName, setEditingName] = useState(false)
  const [routineNameDraft, setRoutineNameDraft] = useState(activeRoutine?.name ?? '')

  // Ejercicios
  const [editingExId, setEditingExId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditingExercise>(emptyExercise())
  const [showAddForm, setShowAddForm] = useState(false)
  const [addDraft, setAddDraft] = useState<EditingExercise>(emptyExercise())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Otras rutinas
  const [showOtherRoutines, setShowOtherRoutines] = useState(false)

  function run(fn: () => Promise<{ error?: string | null; success?: boolean }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) { setError(res.error); return }
      router.refresh()
    })
  }

  // ── Crear rutina ──────────────────────────────────────────────────────────
  function handleCreateRoutine() {
    if (!newRoutineName.trim()) return
    run(() => createRoutine(clientId, newRoutineName, null).then(r => {
      if (!r.error) { setShowCreateForm(false); setNewRoutineName('') }
      return r
    }))
  }

  // ── Renombrar rutina ──────────────────────────────────────────────────────
  function handleSaveRoutineName() {
    if (!activeRoutine || !routineNameDraft.trim()) return
    run(() => updateRoutineMeta(activeRoutine.id, clientId, routineNameDraft, activeRoutine.description).then(r => {
      if (!r.error) setEditingName(false)
      return r
    }))
  }

  // ── Editar ejercicio ──────────────────────────────────────────────────────
  function startEditExercise(ex: ExerciseData) {
    setEditingExId(ex.id)
    setEditDraft({ name: ex.name, sets: ex.sets, reps: ex.reps ?? '', suggested_weight: ex.suggested_weight ?? '', notes: ex.notes ?? '' })
  }

  function handleSaveExercise(ex: ExerciseData) {
    if (!editDraft.name.trim()) return
    run(() => updateExercise({
      exerciseId: ex.id,
      clientId,
      name: editDraft.name,
      sets: editDraft.sets,
      reps: editDraft.reps || null,
      suggestedWeight: editDraft.suggested_weight || null,
      notes: editDraft.notes || null,
    }).then(r => {
      if (!r.error) setEditingExId(null)
      return r
    }))
  }

  // ── Agregar ejercicio ─────────────────────────────────────────────────────
  function handleAddExercise() {
    if (!activeRoutine || !addDraft.name.trim()) return
    const nextOrder = Math.max(0, ...activeRoutine.exercises.map(e => e.order_index)) + 1
    run(() => addExercise({
      routineId: activeRoutine.id,
      clientId,
      name: addDraft.name,
      sets: addDraft.sets,
      reps: addDraft.reps || null,
      suggestedWeight: addDraft.suggested_weight || null,
      notes: addDraft.notes || null,
      orderIndex: nextOrder,
    }).then(r => {
      if (!r.error) { setAddDraft(emptyExercise()); setShowAddForm(false) }
      return r
    }))
  }

  // ── Eliminar ejercicio ────────────────────────────────────────────────────
  function handleDelete(exerciseId: string) {
    run(() => deleteExercise(exerciseId, clientId).then(r => {
      setConfirmDeleteId(null)
      return r
    }))
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Sin rutina ── */}
      {!activeRoutine && !showCreateForm && (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500 mb-4">Este cliente no tiene una rutina asignada.</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm
                       font-semibold rounded-lg hover:bg-brand-dark transition-colors"
          >
            <Plus size={16} /> Crear rutina
          </button>
        </div>
      )}

      {/* ── Formulario nueva rutina ── */}
      {showCreateForm && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Nueva rutina</p>
          <input
            autoFocus
            type="text"
            value={newRoutineName}
            onChange={e => setNewRoutineName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateRoutine()}
            placeholder="Ej: Fuerza Base — Semana 1"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowCreateForm(false)} disabled={isPending}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleCreateRoutine} disabled={isPending || !newRoutineName.trim()}
              className="flex-1 py-2 bg-brand text-white rounded-lg text-sm font-semibold
                         hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-1">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Crear
            </button>
          </div>
        </div>
      )}

      {/* ── Rutina activa ── */}
      {activeRoutine && (
        <div className="space-y-3">
          {/* Nombre de la rutina */}
          <div className="flex items-center gap-2">
            {editingName ? (
              <>
                <input
                  autoFocus
                  value={routineNameDraft}
                  onChange={e => setRoutineNameDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveRoutineName()}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <button onClick={handleSaveRoutineName} disabled={isPending}
                  className="p-1.5 bg-brand text-white rounded-lg hover:bg-brand-dark disabled:opacity-50">
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                </button>
                <button onClick={() => { setEditingName(false); setRoutineNameDraft(activeRoutine.name) }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-900 flex-1">{activeRoutine.name}</h3>
                <button onClick={() => { setEditingName(true); setRoutineNameDraft(activeRoutine.name) }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                  <Pencil size={14} />
                </button>
              </>
            )}
          </div>

          {/* Lista de ejercicios */}
          {activeRoutine.exercises.length === 0 && !showAddForm ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Sin ejercicios. Agrega el primero abajo.
            </p>
          ) : (
            <div className="space-y-2">
              {activeRoutine.exercises
                .sort((a, b) => a.order_index - b.order_index)
                .map((ex, idx) => (
                  <div key={ex.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    {editingExId === ex.id ? (
                      <ExerciseForm
                        draft={editDraft}
                        onChange={setEditDraft}
                        onSave={() => handleSaveExercise(ex)}
                        onCancel={() => setEditingExId(null)}
                        isPending={isPending}
                        label={`Ejercicio ${idx + 1}`}
                      />
                    ) : (
                      <div className="p-3 flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs
                                         font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
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
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {confirmDeleteId === ex.id ? (
                            <>
                              <button onClick={() => handleDelete(ex.id)} disabled={isPending}
                                className="text-xs text-red-600 font-semibold px-2 py-1 rounded hover:bg-red-50">
                                {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Eliminar'}
                              </button>
                              <button onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-gray-400 px-1 py-1 rounded hover:bg-gray-100">
                                <X size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEditExercise(ex)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => setConfirmDeleteId(ex.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Formulario agregar ejercicio */}
          {showAddForm ? (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <ExerciseForm
                draft={addDraft}
                onChange={setAddDraft}
                onSave={handleAddExercise}
                onCancel={() => { setShowAddForm(false); setAddDraft(emptyExercise()) }}
                isPending={isPending}
                label="Nuevo ejercicio"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed
                         border-gray-300 rounded-xl text-sm text-gray-500 hover:border-gray-400
                         hover:text-gray-700 transition-colors"
            >
              <Plus size={16} /> Agregar ejercicio
            </button>
          )}
        </div>
      )}

      {/* ── Otras rutinas ── */}
      {allRoutines.length > 1 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowOtherRoutines(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Otras rutinas ({allRoutines.filter(r => !r.is_active).length})
            {showOtherRoutines ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showOtherRoutines && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {allRoutines
                .filter(r => !r.is_active)
                .map(r => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3 bg-white">
                    <p className="text-sm text-gray-700">{r.name}</p>
                    <button
                      onClick={() => run(() => activateRoutine(r.id, clientId))}
                      disabled={isPending}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                    >
                      Activar
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Botón nueva rutina (cuando ya existe una) */}
      {activeRoutine && (
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500
                     hover:text-gray-700 transition-colors"
        >
          <Plus size={14} /> Crear nueva rutina
        </button>
      )}
    </div>
  )
}

// ─── ExerciseForm sub-component ───────────────────────────────────────────────

function ExerciseForm({
  draft, onChange, onSave, onCancel, isPending, label,
}: {
  draft: EditingExercise
  onChange: (d: EditingExercise) => void
  onSave: () => void
  onCancel: () => void
  isPending: boolean
  label: string
}) {
  return (
    <div className="p-4 space-y-3 bg-gray-50">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <input
        autoFocus
        type="text"
        value={draft.name}
        onChange={e => onChange({ ...draft, name: e.target.value })}
        placeholder="Nombre del ejercicio *"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white
                   focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Series</label>
          <input
            type="number"
            min={1}
            value={draft.sets ?? ''}
            onChange={e => onChange({ ...draft, sets: e.target.value ? parseInt(e.target.value) : null })}
            placeholder="4"
            className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Reps</label>
          <input
            type="text"
            value={draft.reps ?? ''}
            onChange={e => onChange({ ...draft, reps: e.target.value })}
            placeholder="8-10"
            className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Peso sugerido</label>
          <input
            type="text"
            value={draft.suggested_weight ?? ''}
            onChange={e => onChange({ ...draft, suggested_weight: e.target.value })}
            placeholder="60 kg"
            className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>
      <input
        type="text"
        value={draft.notes ?? ''}
        onChange={e => onChange({ ...draft, notes: e.target.value })}
        placeholder="Notas (opcional)"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white
                   focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} disabled={isPending}
          className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-white">
          Cancelar
        </button>
        <button onClick={onSave} disabled={isPending || !draft.name.trim()}
          className="flex-1 py-2 bg-brand text-white rounded-lg text-sm font-semibold
                     hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-1">
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Guardar
        </button>
      </div>
    </div>
  )
}
