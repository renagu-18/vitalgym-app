'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'No autenticado' as string }
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin') return { supabase: null, error: 'No autorizado' as string }
  return { supabase, error: null }
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
    suggested_weight: data.suggestedWeight?.trim() || null,
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
    suggested_weight: data.suggestedWeight?.trim() || null,
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
  exerciseId: string | null
  exerciseName: string
  setsDone: number | null
  repsDone: string | null
  weightUsed: string | null
  notes: string | null
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

  const exLogs = data.exercises
    .filter(e => e.exerciseName.trim())
    .map(e => ({
      training_log_id: log.id,
      exercise_id: e.exerciseId,
      exercise_name: e.exerciseName.trim(),
      sets_done: e.setsDone,
      reps_done: e.repsDone?.trim() || null,
      weight_used: e.weightUsed?.trim() || null,
      notes: e.notes?.trim() || null,
    }))

  if (exLogs.length > 0) {
    const { error: exErr } = await supabase.from('exercise_logs').insert(exLogs)
    if (exErr) return { error: exErr.message }
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
