import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { buildHistory, loadCollected, loadDaily, loadMonths, loadNational, loadWeeks } from '../lib/historyData'

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

/** Daily / weekly / monthly summaries per area (collector/rollup.mjs). */
export function usePriceRecords() {
  const opts = { staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000 }
  const daily = useQuery({ queryKey: ['history', 'daily'], queryFn: loadDaily, ...opts })
  const weeks = useQuery({ queryKey: ['history', 'weeks'], queryFn: loadWeeks, ...opts })
  const months = useQuery({ queryKey: ['history', 'months'], queryFn: loadMonths, ...opts })
  return {
    daily: daily.data ?? null,
    weeks: weeks.data ?? [],
    months: months.data ?? null,
    isLoading: daily.isLoading || weeks.isLoading || months.isLoading,
  }
}
