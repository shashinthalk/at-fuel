import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { buildHistory, loadCollected, loadNational } from '../lib/historyData'

/** Recorded station price history (collector file + this browser's own observations). */
export function useHistoryData(localStamp = 0) {
  const collected = useQuery({
    queryKey: ['history', 'collected'],
    queryFn: loadCollected,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
  const data = useMemo(
    () => buildHistory(collected.data ?? null),
    // localStamp changes whenever live prices are refreshed (and recorded locally)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collected.data, localStamp],
  )
  return { data, isLoading: collected.isLoading }
}

/** Official weekly national averages (EU Weekly Oil Bulletin). */
export function useNationalHistory() {
  return useQuery({ queryKey: ['history', 'national'], queryFn: loadNational, staleTime: Infinity })
}
