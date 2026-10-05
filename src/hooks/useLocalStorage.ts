import { useCallback, useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or unavailable */
    }
  }, [key, value])

  return [value, setValue] as const
}

export function useFavorites() {
  const [ids, setIds] = useLocalStorage<number[]>('fuel:favorites', [])
  const toggle = useCallback(
    (id: number) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    [setIds],
  )
  return { favorites: new Set(ids), toggle }
}

export const MAX_COMPARE = 4

/** Stations picked for the "where should I fuel up?" comparison. */
export function useCompareList() {
  const [ids, setIds] = useLocalStorage<number[]>('fuel:compare', [])
  const toggle = useCallback(
    (id: number) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COMPARE ? cur : [...cur, id])),
    [setIds],
  )
  const clear = useCallback(() => setIds([]), [setIds])
  return { compareIds: ids, setCompareIds: setIds, toggleCompare: toggle, clearCompare: clear }
}
