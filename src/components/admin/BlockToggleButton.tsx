'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toggleBlock, deleteBlock } from '@/app/admin/calendar/actions'

export function ToggleBlockButton({ blockId, isActive }: { blockId: string; isActive: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle() {
    startTransition(async () => {
      await toggleBlock(blockId, !isActive)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handle}
      disabled={isPending}
      className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50
        ${isActive
          ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          : 'bg-green-50 text-green-700 hover:bg-green-100'
        }`}
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : isActive ? 'Desactivar' : 'Activar'}
    </button>
  )
}

export function DeleteBlockButton({ blockId }: { blockId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle() {
    if (!confirm('¿Eliminar este bloque?')) return
    startTransition(async () => {
      const res = await deleteBlock(blockId)
      if (res?.error) { alert(res.error); return }
      router.refresh()
    })
  }

  return (
    <button
      onClick={handle}
      disabled={isPending}
      className="text-xs font-medium px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50
                 transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Eliminar'}
    </button>
  )
}
