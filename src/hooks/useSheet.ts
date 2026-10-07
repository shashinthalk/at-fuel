import { useEffect, useRef, type PointerEvent } from 'react'

/** Locks page scrolling while a sheet or drawer is open. */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prev
    }
  }, [active])
}

/**
 * Drag-down-to-dismiss for a bottom sheet. Spread `handle` on the grab area
 * (not on scrolling content) and attach `ref` to the sheet itself.
 */
export function useDragToClose<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const drag = useRef<{ y: number; t: number } | null>(null)

  const end = (e: PointerEvent) => {
    const el = ref.current
    if (!drag.current || !el) return
    const dy = e.clientY - drag.current.y
    const speed = dy / Math.max(1, e.timeStamp - drag.current.t)
    drag.current = null
    el.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.25, 1)'
    // Close on a long drag or a quick flick.
    if (dy > 110 || (dy > 30 && speed > 0.5)) {
      el.style.transform = 'translateY(100%)'
      window.setTimeout(onClose, 200)
    } else {
      el.style.transform = ''
    }
  }

  const handle = {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      drag.current = { y: e.clientY, t: e.timeStamp }
      e.currentTarget.setPointerCapture(e.pointerId)
      if (ref.current) ref.current.style.transition = 'none'
    },
    onPointerMove: (e: PointerEvent) => {
      if (!drag.current || !ref.current) return
      const dy = e.clientY - drag.current.y
      // Resist dragging upwards.
      ref.current.style.transform = `translateY(${dy > 0 ? dy : dy / 6}px)`
    },
    onPointerUp: end,
    onPointerCancel: end,
    style: { touchAction: 'none' as const },
  }
  return { ref, handle }
}
