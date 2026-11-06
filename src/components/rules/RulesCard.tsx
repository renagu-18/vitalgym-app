'use client'

import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { RULES_SHORT } from '@/lib/rules'
import RulesSheet from './RulesSheet'

export default function RulesCard() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <ClipboardList size={16} />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Reglas del gimnasio</h3>
        </div>

        <ul className="space-y-1.5">
          {RULES_SHORT.map(rule => (
            <li key={rule} className="flex gap-2 text-xs text-gray-600 leading-relaxed">
              <span className="w-1 h-1 rounded-full bg-brand shrink-0 mt-[7px]" />
              {rule}
            </li>
          ))}
        </ul>

        <button
          onClick={() => setOpen(true)}
          className="mt-3 w-full py-2.5 border border-gray-200 rounded-xl text-sm font-semibold
                     text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Ver reglamento completo
        </button>
      </div>

      {open && <RulesSheet title="Reglamento del gimnasio" onClose={() => setOpen(false)} />}
    </>
  )
}
