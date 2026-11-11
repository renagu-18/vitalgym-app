'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parsePeso } from '@/lib/peso'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'No autenticado' as string }
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin') return { supabase: null, error: 'No autorizado' as string }
  return { supabase, error: null }
}

// El peso sugerido es texto libre ("60-70 kg", "barra"): si es un número se normaliza a "32.5".
function normalizeSuggestedWeight(raw: string | null) {
  const text = raw?.trim()
  if (!text) return null
  const kg = parsePeso(text)
  return kg === null ? text : String(kg)
}

function revalidate(clientId: string) {
  revalidatePath(`/admin/training/${clientId}`)
  revalidatePath('/admin/training')
}

// ─── Rutinas ───────────────────────────────────────────────────────────────

export async function createRoutine(clientId: string, name: string, description: string | null) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  // Desactivar rutinas anteriores
  await supabase.from('routines').update({ is_active: false }).eq('client_id', clientId)

  const { data, error: insertErr } = await supabase
    .from('routines')
    .insert({ client_id: clientId, name: name.trim(), description, is_active: true })
    .select()
    .single()

  if (insertErr) return { error: insertErr.message }
  revalidate(clientId)
  return { success: true, routineId: data.id }
}

export async function updateRoutineMeta(
  routineId: string,
  clientId: string,
  name: string,
  description: string | null
) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: updateErr } = await supabase
    .from('routines')
    .update({ name: name.trim(), description })
    .eq('id', routineId)

  if (updateErr) return { error: updateErr.message }
  revalidate(clientId)
  return { success: true }
}

export async function activateRoutine(routineId: string, clientId: string) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  await supabase.from('routines').update({ is_active: false }).eq('client_id', clientId)
  const { error: activateErr } = await supabase
    .from('routines')
    .update({ is_active: true })
    .eq('id', routineId)

  if (activateErr) return { error: activateErr.message }
  revalidate(clientId)
  return { success: true }
}

// ─── Ejercicios ────────────────────────────────────────────────────────────

export async function addExercise(data: {
  routineId: string
  clientId: string
  name: string
  sets: number | null
  reps: string | null
  suggestedWeight: string | null
  notes: string | null
  orderIndex: number
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: insertErr } = await supabase.from('exercises').insert({
    routine_id: data.routineId,
    name: data.name.trim(),
    sets: data.sets,
    reps: data.reps?.trim() || null,
    suggested_weight: normalizeSuggestedWeight(data.suggestedWeight),
    notes: data.notes?.trim() || null,
    order_index: data.orderIndex,
  })

  if (insertErr) return { error: insertErr.message }
  revalidate(data.clientId)
  return { success: true }
}

export async function updateExercise(data: {
  exerciseId: string
  clientId: string
  name: string
  sets: number | null
  reps: string | null
  suggestedWeight: string | null
  notes: string | null
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: updateErr } = await supabase.from('exercises').update({
    name: data.name.trim(),
    sets: data.sets,
    reps: data.reps?.trim() || null,
    suggested_weight: normalizeSuggestedWeight(data.suggestedWeight),
    notes: data.notes?.trim() || null,
  }).eq('id', data.exerciseId)

  if (updateErr) return { error: updateErr.message }
  revalidate(data.clientId)
  return { success: true }
}

export async function deleteExercise(exerciseId: string, clientId: string) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: deleteErr } = await supabase.from('exercises').delete().eq('id', exerciseId)
  if (deleteErr) return { error: deleteErr.message }
  revalidate(clientId)
  return { success: true }
}

// ─── Logs de entrenamiento ─────────────────────────────────────────────────

export interface ExerciseLogInput {
  /** id del exercise_log al editar una sesión; null en filas nuevas */
  id?: string | null
  exerciseId: string | null
  exerciseName: string
  setsDone: number | null
  repsDone: string | null
  weightUsed: string | null
  notes: string | null
}

// Filtra filas vacías y normaliza el peso usado a "32.5". Rechaza pesos que no son un número.
function buildExerciseLogs(exercises: ExerciseLogInput[]) {
  const rows = []
  for (const e of exercises) {
    const name = e.exerciseName.trim()
    if (!name) continue
    const weightText = e.weightUsed?.trim()
    const kg = weightText ? parsePeso(weightText) : null
    if (weightText && kg === null) {
      return { rows: [], error: `Peso inválido en "${name}": "${weightText}"` }
    }
    rows.push({
      id: e.id ?? null,
      exerciseId: e.exerciseId,
      // columnas editables (las que acepta un update)
      values: {
        exercise_name: name,
        sets_done: e.setsDone,
        reps_done: e.repsDone?.trim() || null,
        weight_used: kg === null ? null : String(kg),
        notes: e.notes?.trim() || null,
      },
    })
  }
  return { rows, error: null }
}

export async function createTrainingLog(data: {
  clientId: string
  logDate: string
  routineId: string | null
  notes: string | null
  exercises: ExerciseLogInput[]
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { rows, error: rowsErr } = buildExerciseLogs(data.exercises)
  if (rowsErr) return { error: rowsErr }

  const { data: log, error: logErr } = await supabase
    .from('training_logs')
    .insert({
      client_id: data.clientId,
      routine_id: data.routineId,
      log_date: data.logDate,
      notes: data.notes?.trim() || null,
    })
    .select()
    .single()

  if (logErr) return { error: logErr.message }

  const exLogs = rows.map(r => ({ ...r.values, exercise_id: r.exerciseId, training_log_id: log.id }))

  if (exLogs.length > 0) {
    const { error: exErr } = await supabase.from('exercise_logs').insert(exLogs)
    if (exErr) return { error: exErr.message }
  }

  revalidate(data.clientId)
  return { success: true }
}

// Edita una sesión existente: actualiza las filas que ya tenían id, inserta las nuevas
// y borra las que se quitaron del formulario.
export async function updateTrainingLog(data: {
  logId: string
  clientId: string
  logDate: string
  notes: string | null
  exercises: ExerciseLogInput[]
}) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { rows, error: rowsErr } = buildExerciseLogs(data.exercises)
  if (rowsErr) return { error: rowsErr }

  const { data: log, error: logErr } = await supabase
    .from('training_logs')
    .update({ log_date: data.logDate, notes: data.notes?.trim() || null })
    .eq('id', data.logId)
    .eq('client_id', data.clientId)
    .select('id, exercise_logs(id)')
    .single()

  if (logErr) return { error: logErr.message }

  const existingIds = new Set((log.exercise_logs ?? []).map(e => e.id))
  const toUpdate = rows.filter(r => r.id && existingIds.has(r.id))
  const toInsert = rows
    .filter(r => !r.id || !existingIds.has(r.id))
    .map(r => ({ ...r.values, exercise_id: r.exerciseId, training_log_id: data.logId }))
  const keptIds = new Set(toUpdate.map(r => r.id))
  const toDelete = [...existingIds].filter(id => !keptIds.has(id))

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from('exercise_logs').delete().in('id', toDelete)
    if (delErr) return { error: delErr.message }
  }

  for (const r of toUpdate) {
    const { error: updErr } = await supabase
      .from('exercise_logs')
      .update(r.values)
      .eq('id', r.id!)
      .eq('training_log_id', data.logId)
    if (updErr) return { error: updErr.message }
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from('exercise_logs').insert(toInsert)
    if (insErr) return { error: insErr.message }
  }

  revalidate(data.clientId)
  return { success: true }
}

export async function deleteTrainingLog(logId: string, clientId: string) {
  const { supabase, error } = await verifyAdmin()
  if (!supabase) return { error }

  const { error: deleteErr } = await supabase.from('training_logs').delete().eq('id', logId)
  if (deleteErr) return { error: deleteErr.message }
  revalidate(clientId)
  return { success: true }
}
