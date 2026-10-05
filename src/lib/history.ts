// The API exposes no price history, so we build one locally: every time a
// station's price is seen, it is recorded (deduped per hour) in localStorage.
import type { Station } from './station'

const KEY = 'fuel:history:v1'
const MAX_POINTS = 200
const MAX_AGE_MS = 30 * 24 * 3600 * 1000

export interface HistoryPoint {
  t: number
  p: number
}
type Store = Record<string, HistoryPoint[]> // key: `${stationId}:${fuel}`

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

export function recordPrices(stations: Station[]) {
  const store = load()
  const now = Date.now()
  for (const s of stations) {
    for (const [fuel, price] of Object.entries(s.prices)) {
      const k = `${s.id}:${fuel}`
      const pts = (store[k] ?? []).filter((x) => now - x.t < MAX_AGE_MS)
      const last = pts[pts.length - 1]
      if (last && last.p === price && now - last.t < 3600_000) continue
      pts.push({ t: now, p: price })
      store[k] = pts.slice(-MAX_POINTS)
    }
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* ignore quota errors */
  }
}


export function clearHistory() {
  localStorage.removeItem(KEY)
}

export function getAllLocal(): Store {
  return load()
}
