'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Zap } from 'lucide-react'
import { generateBlocks } from '@/app/admin/calendar/actions'

export default function GenerateBlocksForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error?: string; count?: number } | null>(null)

  // Defaults: hoy → 3 meses
  const today = new Date().toISOString().split('T')[0]
  const threeMonths = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]

  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(threeMonths)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const res = await generateBlocks(start, end)
      setResult(res.error ? { error: res.error } : { count: res.count })
      if (!res.error) router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-900">Generar bloques horarios</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Crea bloques Lun–Vie 6–10 h y 18–22 h · Sáb 9–11 h. Los bloques que ya existen no se duplican.
      </p>

      {result?.error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{result.error}</p>
      )}
      {result?.count !== undefined && (
        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
          ✓ {result.count} bloques creados correctamente
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand text-white
                   text-sm font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50 transition-colors"
      >
        {isPending ? <><Loader2 size={14} className="animate-spin" /> Generando...</> : 'Generar bloques'}
      </button>
    </form>
  )
}
