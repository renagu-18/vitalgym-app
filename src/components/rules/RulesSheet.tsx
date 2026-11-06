'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { RULES_FULL } from '@/lib/rules'
import { useEscapeKey } from '@/lib/use-escape-key'

// Numeración corrida 1–10 a través de las categorías, como en el reglamento original.
const NUMBERED = RULES_FULL.map((cat, i) => ({
  ...cat,
  start: RULES_FULL.slice(0, i).reduce((n, c) => n + c.rules.length, 1),
}))

export function RulesList() {
  return (
    <div className="space-y-5">
      {NUMBERED.map(cat => (
        <section key={cat.title}>
          <h4 className="text-sm font-bold text-gray-900 mb-2">{cat.title}</h4>
          <ol className="space-y-2.5">
            {cat.rules.map((rule, i) => (
              <li key={rule.text} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-brand/10 text-brand text-[11px] font-bold
                                 flex items-center justify-center shrink-0 mt-px">
                  {cat.start + i}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 leading-relaxed">{rule.text}</p>
                  {rule.example && (
                    <p className="text-xs text-gray-400 italic leading-relaxed mt-0.5">{rule.example}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

// Panel deslizable en celular / modal centrado en escritorio (mismo patrón que BookingModal y
// TodayPanel). Se cierra con la X, clic afuera y Escape.
export default function RulesSheet({
  title, onClose, intro, footer,
}: {
  title: string
  onClose: () => void
  intro?: React.ReactNode
  footer?: React.ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEscapeKey(onClose)

  // Bloquea el scroll del fondo, mueve el foco al panel y lo devuelve al cerrar.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg mx-auto shadow-2xl
                   max-h-[85vh] flex flex-col outline-none"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 sm:hidden shrink-0" />

        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-gray-50 shrink-0">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-gray-900">{title}</h3>
            {intro && <p className="text-xs text-gray-500 mt-0.5">{intro}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          <RulesList />
        </div>

        {footer && (
          <div className="px-5 pt-3 pb-5 border-t border-gray-100 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
