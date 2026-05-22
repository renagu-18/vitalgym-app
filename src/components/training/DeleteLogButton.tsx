'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteTrainingLog } from '@/app/admin/training/[clientId]/actions'

export default function DeleteLogButton({ logId, clientId }: { logId: string; clientId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle() {
    if (!confirm('¿Eliminar este registro de sesión?')) return
    startTransition(async () => {
      await deleteTrainingLog(logId, clientId)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handle}
      disabled={isPending}
      className="p-1.5 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  )
}
