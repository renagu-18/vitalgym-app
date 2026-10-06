'use client'

import { useActionState, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

type ActionResult = { error?: string; message?: string } | void

interface AuthFormProps {
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
  /** Segundos que el botón queda deshabilitado tras cada envío (freno simple contra reenvíos). */
  cooldownSeconds?: number
  children: React.ReactNode
}

export default function AuthForm({ action, submitLabel, cooldownSeconds = 0, children }: AuthFormProps) {
  const [cooldown, setCooldown] = useState(0)

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await action(formData)
      if (cooldownSeconds > 0) setCooldown(cooldownSeconds)
      return result
    },
    undefined
  )

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  return (
    <form action={formAction} className="space-y-5">
      {children}

      {state?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      {state?.message && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
          <p className="text-sm text-green-700">{state.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || cooldown > 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                   bg-brand text-white text-sm font-semibold rounded-lg
                   hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed
                   transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Cargando...
          </>
        ) : cooldown > 0 ? (
          `Reenviar en ${cooldown} s`
        ) : (
          submitLabel
        )}
      </button>
    </form>
  )
}
