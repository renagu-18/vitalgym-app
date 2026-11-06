'use client'

import { useEffect, useRef } from 'react'

// Llama a onEscape al presionar Escape mientras `active` sea true (p.ej. mientras un modal está abierto).
export function useEscapeKey(onEscape: () => void, active = true) {
  const handler = useRef(onEscape)
  useEffect(() => {
    handler.current = onEscape
  })

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active])
}
