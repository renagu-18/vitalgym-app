// Pesos en kg. Se ingresan con coma o punto decimal ("32,5", "32.5", "32,5 kg"),
// se guardan normalizados con punto ("32.5") y se muestran con coma ("32,5 kg").

export const PESO_CONFIRMAR_KG = 300

/** Convierte lo que escribió el usuario a número. null si está vacío o no es un peso válido. */
export function parsePeso(input: string | number | null | undefined): number | null {
  if (input == null) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  const s = input.trim().toLowerCase().replace(/\s*kgs?\.?$/, '').replace(/\s+/g, '')
  if (!/^\d+([.,]\d+)?$/.test(s)) return null
  return Number(s.replace(',', '.'))
}

/**
 * Muestra un peso con coma decimal: 32.5 → "32,5 kg". Sin unidad sirve para precargar inputs.
 * Si el valor guardado no es un número (texto libre como "60-70 kg"), lo devuelve tal cual.
 */
export function formatPeso(value: string | number | null | undefined, conUnidad = true): string {
  if (value == null) return ''
  const kg = parsePeso(value)
  if (kg === null) return String(value).trim()
  const n = kg.toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false })
  return conUnidad ? `${n} kg` : n
}

/** Pide confirmación si algún peso supera PESO_CONFIRMAR_KG. Devuelve false si el usuario cancela. */
export function confirmarPesosAltos(items: { label: string; kg: number | null }[]): boolean {
  const altos = items.filter(i => i.kg !== null && i.kg > PESO_CONFIRMAR_KG)
  if (altos.length === 0) return true
  const lista = altos.map(i => `• ${i.label}: ${formatPeso(i.kg)}`).join('\n')
  return confirm(`Estos pesos superan los ${PESO_CONFIRMAR_KG} kg:\n\n${lista}\n\n¿Guardar de todas formas?`)
}
