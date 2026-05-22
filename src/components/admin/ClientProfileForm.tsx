'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { updateClientProfile } from '@/app/admin/clients/[clientId]/actions'

interface Props {
  clientId: string
  fullName: string
  phone: string | null
  notifyVia: 'whatsapp' | 'gmail'
}

export default function ClientProfileForm({ clientId, fullName, phone, notifyVia }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(fullName)
  const [phoneVal, setPhone] = useState(phone ?? '')
  const [notify, setNotify] = useState<'whatsapp' | 'gmail'>(notifyVia)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    if (!name.trim()) return
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await updateClientProfile(clientId, {
        full_name: name,
        phone: phoneVal.trim() || null,
        notify_via: notify,
      })
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-4">
      <p className="text-sm font-semibold text-gray-900">Información del cliente</p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nombre completo</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono</label>
          <input type="tel" value={phoneVal} onChange={e => setPhone(e.target.value)}
            placeholder="+56 9 1234 5678"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Notificaciones</label>
          <div className="grid grid-cols-2 gap-2">
            {(['whatsapp', 'gmail'] as const).map(v => (
              <label key={v} className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer transition-colors
                ${notify === v ? 'border-brand bg-gray-50' : 'border-gray-200'}`}>
                <input type="radio" name="notify" value={v} checked={notify === v}
                  onChange={() => setNotify(v)} className="accent-brand" />
                <span className="text-sm font-medium capitalize">{v === 'whatsapp' ? 'WhatsApp' : 'Gmail'}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Cambios guardados ✓</p>}

      <button onClick={handleSave} disabled={isPending || !name.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand text-white
                   text-sm font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50">
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Guardar cambios
      </button>
    </div>
  )
}
