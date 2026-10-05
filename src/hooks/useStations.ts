import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { fetchRegions, FUEL_TYPES, searchByLocation, searchByRegion, type FuelType } from '../api/econtrol'
import { scanPoints, type LatLon, type ScanMode } from '../lib/geo'
import { recordPrices } from '../lib/history'
import { mergeStations } from '../lib/station'

export type SearchTarget =
  | { kind: 'location'; center: LatLon; label: string; scan: ScanMode }
  | { kind: 'region'; code: number; type: 'BL' | 'PB'; label: string }

const REFRESH_MS = 5 * 60 * 1000

/**
 * Runs one query per (scan point × fuel type) and merges everything into a
 * single station list with prices for all fuel types side by side.
 */
export function useStations(target: SearchTarget, includeClosed: boolean) {
  const jobs = useMemo(() => {
    const fuels = FUEL_TYPES.map((f) => f.id)
    if (target.kind === 'region') {
      return fuels.map((fuel) => ({
        key: ['region', target.type, target.code, fuel, includeClosed],
        fuel,
        run: (signal: AbortSignal) => searchByRegion(target.code, target.type, fuel, includeClosed, signal),
      }))
    }
    return scanPoints(target.center, target.scan).flatMap((p) =>
      fuels.map((fuel) => ({
        key: ['loc', p.lat.toFixed(4), p.lon.toFixed(4), fuel, includeClosed],
        fuel,
        run: (signal: AbortSignal) => searchByLocation(p.lat, p.lon, fuel, includeClosed, signal),
      })),
    )
  }, [target, includeClosed])

  const results = useQueries({
    queries: jobs.map((j) => ({
      queryKey: j.key,
      queryFn: ({ signal }: { signal: AbortSignal }) => j.run(signal),
      staleTime: REFRESH_MS,
      refetchInterval: REFRESH_MS,
    })),
  })

  const done = results.filter((r) => r.data)
  const dataStamp = results.map((r) => r.dataUpdatedAt).join(',')

  const stations = useMemo(() => {
    const origin = target.kind === 'location' ? target.center : null
    return mergeStations(
      results.flatMap((r, i) => (r.data ? [{ fuelType: jobs[i].fuel as FuelType, stations: r.data }] : [])),
      origin,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStamp, jobs, target])

  useEffect(() => {
    if (stations.length) recordPrices(stations)
  }, [stations])

  const updatedAt = Math.max(0, ...results.map((r) => r.dataUpdatedAt))

  return {
    stations,
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    progress: jobs.length ? done.length / jobs.length : 1,
    errors: results.filter((r) => r.error).map((r) => (r.error as Error).message),
    queryCount: jobs.length,
    updatedAt,
    refetch: () => results.forEach((r) => r.refetch()),
  }
}

export function useRegions() {
  return useQuery({
    queryKey: ['regions'],
    queryFn: ({ signal }) => fetchRegions(signal),
    staleTime: Infinity,
  })
}
