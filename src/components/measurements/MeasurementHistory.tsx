'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteMeasurement } from '@/app/admin/measurements/[clientId]/actions'

type Measurement = {
  id: string
  client_id: string
  measured_at: string
  weight_kg: number | null
  height_cm: number | null
  body_fat_pct: number | null
  waist_cm: number | null
  hip_cm: number | null
  chest_cm: number | null
  arms_cm: number | null
  legs_cm: number | null
  notes: string | null
  created_at: string
}

interface Props {
  measurements: Measurement[]
  clientId: string
  isAdmin?: boolean
}

function MiniLineChart({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 80, h = 32, pad = 4
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  })

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]}
        r="2.5" fill={color} />
    </svg>
  )
}

const METRIC_LABELS: { key: keyof Measurement; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg' },
  { key: 'body_fat_pct', label: '% Grasa', unit: '%' },
  { key: 'waist_cm', label: 'Cintura', unit: 'cm' },
  { key: 'hip_cm', label: 'Cadera', unit: 'cm' },
  { key: 'chest_cm', label: 'Pecho', unit: 'cm' },
  { key: 'arms_cm', label: 'Brazos', unit: 'cm' },
  { key: 'legs_cm', label: 'Piernas', unit: 'cm' },
]

function DeleteButton({ measurementId, clientId }: { measurementId: string; clientId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle() {
    startTransition(async () => {
      await deleteMeasurement(measurementId, clientId)
      router.refresh()
    })
  }

  return (
    <button onClick={handle} disabled={isPending}
      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50">
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  )
}

export default function MeasurementHistory({ measurements, clientId, isAdmin = false }: Props) {
  const [showAll, setShowAll] = useState(false)
  const displayed = showAll ? measurements : measurements.slice(0, 5)

  // Build chart data for progress section (chronological order)
  const chronological = [...measurements].reverse()

  return (
    <div className="space-y-4">
      {/* Progress charts */}
      {chronological.length >= 2 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Progreso</p>
          <div className="grid grid-cols-2 gap-3">
            {METRIC_LABELS.map(({ key, label, unit }) => {
              const vals = chronological
                .map(m => m[key] as number | null)
                .filter((v): v is number => v !== null)
              if (vals.length < 2) return null

              const latest = vals[vals.length - 1]
              const prev = vals[vals.length - 2]
              const delta = latest - prev
              const improving = key === 'body_fat_pct' || key === 'waist_cm' || key === 'hip_cm'
                ? delta < 0
                : delta > 0
              const color = delta === 0 ? '#9ca3af' : improving ? '#16a34a' : '#dc2626'

              return (
                <div key={key} className="bg-gray-50 rounded-lg p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-sm font-bold text-gray-900">{latest}<span className="text-xs font-normal text-gray-400"> {unit}</span></p>
                    <p className={`text-[10px] font-medium ${delta === 0 ? 'text-gray-400' : improving ? 'text-green-600' : 'text-red-500'}`}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)} {unit}
                    </p>
                  </div>
                  <MiniLineChart data={vals} color={color} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* History list */}
      {measurements.length > 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <p className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-50">Historial</p>
          <div className="divide-y divide-gray-50">
            {displayed.map(m => (
              <div key={m.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">
                    {new Date(m.measured_at + 'T12:00:00').toLocaleDateString('es-CL', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </p>
                  {isAdmin && <DeleteButton measurementId={m.id} clientId={clientId} />}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {METRIC_LABELS.map(({ key, label, unit }) => {
                    const val = m[key] as number | null
                    if (val === null) return null
                    return (
                      <div key={key} className="bg-gray-50 rounded p-1.5 text-center">
                        <p className="text-xs font-semibold text-gray-800">{val}</p>
                        <p className="text-[10px] text-gray-400">{label}</p>
                        <p className="text-[9px] text-gray-300">{unit}</p>
                      </div>
                    )
                  })}
                  {m.height_cm && (
                    <div className="bg-gray-50 rounded p-1.5 text-center">
                      <p className="text-xs font-semibold text-gray-800">{m.height_cm}</p>
                      <p className="text-[10px] text-gray-400">Talla</p>
                      <p className="text-[9px] text-gray-300">cm</p>
                    </div>
                  )}
                </div>
                {m.notes && <p className="mt-2 text-xs text-gray-400 italic">{m.notes}</p>}
              </div>
            ))}
          </div>
          {measurements.length > 5 && (
            <button onClick={() => setShowAll(v => !v)}
              className="w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-50">
              {showAll ? 'Ver menos' : `Ver ${measurements.length - 5} registros más`}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">Sin mediciones registradas.</p>
        </div>
      )}
    </div>
  )
}
