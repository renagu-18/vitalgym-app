'use client'

import { useActionState } from 'react'
import { Loader2 } from 'lucide-react'

type ActionResult = { error?: string } | void

interface AuthFormProps {
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
  children: React.ReactNode
}

export default function AuthForm({ action, submitLabel, children }: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      return await action(formData)
    },
    undefined
  )

  return (
    <form action={formAction} className="space-y-5">
      {children}

      {state?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
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
        ) : (
          submitLabel
        )}
      </button>
    </form>
  )
}
