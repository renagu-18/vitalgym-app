'use client'

import { useTransition } from 'react'
import { LogOut, Loader2 } from 'lucide-react'
import { logout } from '@/app/auth/actions'

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => logout())}
      disabled={isPending}
      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600
                 disabled:opacity-50 transition-colors"
    >
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
      <span className="hidden sm:inline">Salir</span>
    </button>
  )
}
