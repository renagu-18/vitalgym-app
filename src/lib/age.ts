// La edad NO se guarda: se calcula desde profiles.birth_date ('YYYY-MM-DD'). Clientes antiguos
// tienen birth_date NULL, así que todo lo que muestre edad debe tolerar null.

export const MIN_REGISTRATION_AGE = 17
export const MAX_REGISTRATION_AGE = 60

function todayInSantiago(): { y: number; m: number; d: number } {
  const [y, m, d] = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
    .split('-')
    .map(Number)
  return { y, m, d }
}

/** Edad en años cumplidos a hoy (hora de Santiago), o null si no hay fecha o es inválida. */
export function ageFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const [by, bm, bd] = birthDate.split('-').map(Number)
  // Rechaza fechas inexistentes (2024-02-31) que Date normalizaría en silencio.
  const check = new Date(Date.UTC(by, bm - 1, bd))
  if (check.getUTCFullYear() !== by || check.getUTCMonth() !== bm - 1 || check.getUTCDate() !== bd) return null

  const t = todayInSantiago()
  let age = t.y - by
  if (t.m < bm || (t.m === bm && t.d < bd)) age--
  return age >= 0 ? age : null
}

/** Valida el rango del registro (17–60 inclusive). Devuelve un mensaje de error o null si es válida. */
export function validateRegistrationBirthDate(birthDate: string | null | undefined): string | null {
  const age = ageFromBirthDate(birthDate)
  if (age === null) return 'Ingresa una fecha de nacimiento válida.'
  if (age < MIN_REGISTRATION_AGE || age > MAX_REGISTRATION_AGE) {
    return `Debes tener entre ${MIN_REGISTRATION_AGE} y ${MAX_REGISTRATION_AGE} años para registrarte.`
  }
  return null
}
