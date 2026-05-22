'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { createMeasurement } from '@/app/admin/measurements/[clientId]/actions'

interface Props {
  clientId: string
}

type FieldKey = 'weight_kg' | 'height_cm' | 'body_fat_pct' | 'waist_cm' | 'hip_cm' | 'chest_cm' | 'arms_cm' | 'legs_cm'

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg' },
  { key: 'height_cm', label: 'Talla', unit: 'cm' },
  { key: 'body_fat_pct', label: '% Grasa', unit: '%' },
  { key: 'waist_cm', label: 'Cintura', unit: 'cm' },
  { key: 'hip_cm', label: 'Cadera', unit: 'cm' },
  { key: 'chest_cm', label: 'Pecho', unit: 'cm' },
  { key: 'arms_cm', label: 'Brazos', unit: 'cm' },
  { key: 'legs_cm', label: 'Piernas', unit: 'cm' },
]

export default function MeasurementForm({ clientId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [values, setValues] = useState<Record<FieldKey, string>>(
    Object.fromEntries(FIELDS.map(f => [f.key, ''])) as Record<FieldKey, string>
  )
  const [notes, setNotes] = useState('')

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const data = {
        measured_at: date,
        weight_kg: values.weight_kg ? parseFloat(values.weight_kg) : null,
        height_cm: values.height_cm ? parseFloat(values.height_cm) : null,
        body_fat_pct: values.body_fat_pct ? parseFloat(values.body_fat_pct) : null,
        waist_cm: values.waist_cm ? parseFloat(values.waist_cm) : null,
        hip_cm: values.hip_cm ? parseFloat(values.hip_cm) : null,
        chest_cm: values.chest_cm ? parseFloat(values.chest_cm) : null,
        arms_cm: values.arms_cm ? parseFloat(values.arms_cm) : null,
        legs_cm: values.legs_cm ? parseFloat(values.legs_cm) : null,
        notes: notes.trim() || null,
      }
      const res = await createMeasurement(clientId, data)
      if (res?.error) { setError(res.error); return }
      setValues(Object.fromEntries(FIELDS.map(f => [f.key, ''])) as Record<FieldKey, string>)
      setNotes('')
      setDate(today)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-gray-900">
        <span className="flex items-center gap-2">
          <Plus size={16} /> Registrar medición
        </span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
          <div className="pt-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {f.label} <span className="text-gray-400">({f.unit})</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="—"
                  value={values[f.key]}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones opcionales..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar medición
          </button>
        </div>
      )}
    </div>
  )
}
