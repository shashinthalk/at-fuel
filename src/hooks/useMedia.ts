import { useSyncExternalStore } from 'react'

/** Live result of a CSS media query. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Below the desktop breakpoint (Tailwind `lg`): app-style layout with a bottom tab bar. */
export const useIsMobile = () => useMedia('(max-width: 1023px)')
