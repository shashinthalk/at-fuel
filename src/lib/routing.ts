// Road distances from a start point to several stations via the public OSRM
// demo server (OpenStreetMap data). Falls back to straight-line distance × a
// typical detour factor if the router is unavailable.
import { haversineKm, type LatLon } from './geo'

export interface Route {
  km: number // one way
  minutes: number // one way
  source: 'road' | 'estimate'
}

const ROAD_FACTOR = 1.3 // straight line → typical road distance
const AVG_KMH = 50

export async function routesFrom(start: LatLon, targets: LatLon[], signal?: AbortSignal): Promise<Route[]> {
  if (!targets.length) return []
  const coords = [start, ...targets].map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
  try {
    const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance,duration`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { code: string; distances?: (number | null)[][]; durations?: (number | null)[][] }
    if (json.code !== 'Ok' || !json.distances || !json.durations) throw new Error(json.code)
    return targets.map((t, i) => {
      const m = json.distances![0][i + 1]
      const s = json.durations![0][i + 1]
      return m === null || s === null ? estimate(start, t) : { km: m / 1000, minutes: s / 60, source: 'road' as const }
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    return targets.map((t) => estimate(start, t))
  }
}

function estimate(start: LatLon, t: LatLon): Route {
  const km = haversineKm(start, t) * ROAD_FACTOR
  return { km, minutes: (km / AVG_KMH) * 60, source: 'estimate' }
}
