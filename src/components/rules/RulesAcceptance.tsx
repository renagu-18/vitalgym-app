'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { RULES_VERSION } from '@/lib/rules'
import { acceptRules } from '@/app/dashboard/actions'
import RulesSheet from './RulesSheet'

// Si el cliente cierra sin aceptar, no se le vuelve a mostrar en esta sesión del navegador
// (sessionStorage); reaparece en el siguiente ingreso. Sin sessionStorage, solo se oculta hasta
// que vuelva a cargar el dashboard.
const dismissKey = (userId: string) => `vg_rules_dismissed_v${RULES_VERSION}_${userId}`
const noopSubscribe = () => () => {}

export default function RulesAcceptance({ userId }: { userId: string }) {
  const dismissedInSession = useSyncExternalStore(
    noopSubscribe,
    () => {
      try { return sessionStorage.getItem(dismissKey(userId)) === '1' } catch { return false }
    },
    () => true, // en el servidor no se muestra; se decide al hidratar
  )
  const [closed, setClosed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (dismissedInSession || closed) return null

  function dismiss() {
    if (isPending) return
    try { sessionStorage.setItem(dismissKey(userId), '1') } catch {}
    setClosed(true)
  }

  function handleAccept() {
    setError(null)
    startTransition(async () => {
      const res = await acceptRules()
      if (res.error) {
        setError(res.error)
        return
      }
      setClosed(true)
    })
  }

  return (
    <RulesSheet
      title="Antes de seguir, lee el reglamento"
      intro="Son pocas reglas y nos ayudan a que todos aprovechemos bien cada clase."
      onClose={dismiss}
      footer={
        <>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              disabled={isPending}
              className="w-5 h-5 rounded accent-brand shrink-0"
            />
            <span className="text-sm font-medium text-gray-800">Leí y acepto el reglamento</span>
          </label>

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <button
            onClick={handleAccept}
            disabled={!checked || isPending}
            className="mt-4 w-full py-3 bg-brand rounded-2xl text-sm font-bold text-white hover:bg-brand-dark
                       disabled:opacity-50 transition-colors flex items-center justify-center gap-2
                       shadow-lg shadow-brand/25"
          >
            {isPending
              ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
              : 'Continuar'
            }
          </button>
        </>
      }
    />
  )
}
