// Price history: merges the collector's recorded snapshots
// (public/history/prices.json) with prices this browser has seen,
// and provides time-series helpers. Prices are step functions:
// a value holds until the next recorded change.
import type { FuelType } from '../api/econtrol'
import { getAllLocal } from './history'

export interface Point {
  t: number // ms
  p: number | null // € per litre, null = station seen but no published price
}

export interface CollectedFile {
  version: number
  createdAt: number
  updatedAt: number
  runs: number[] // minutes since epoch
  stations: Record<string, { name: string; address: string; postalCode: string; city: string; lat: number; lon: number }>
  series: Record<string, [number, number | null][]> // [minute, tenth-cents | null]
}

export interface NationalFile {
  source: string
  sourceUrl: string
  importedAt: string
  weeks: { d: string; at95: number | null; atDie: number | null; eu95: number | null; euDie: number | null }[]
}

export interface HistoryData {
  series: Map<string, Point[]>
  stations: CollectedFile['stations']
  runs: number[] // ms, ascending
  firstAt: number | null
  updatedAt: number | null
  hasCollector: boolean
}

export const seriesKey = (id: number, fuel: FuelType) => `${id}:${fuel}`

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// BASE_URL keeps these working when the app is served from a sub-path (GitHub Pages).
export const loadCollected = () => fetchJson<CollectedFile>(`${import.meta.env.BASE_URL}history/prices.json`)
export const loadNational = () => fetchJson<NationalFile>(`${import.meta.env.BASE_URL}history/national.json`)

export function buildHistory(collected: CollectedFile | null): HistoryData {
  const series = new Map<string, Point[]>()
  if (collected) {
    for (const [k, pts] of Object.entries(collected.series)) {
      series.set(
        k,
        pts.map(([m, v]) => ({ t: m * 60000, p: v === null ? null : v / 1000 })),
      )
    }
  }
  // Merge in prices recorded by this browser.
  for (const [k, pts] of Object.entries(getAllLocal())) {
    const merged = [...(series.get(k) ?? []), ...pts.map((x) => ({ t: x.t, p: x.p }))].sort((a, b) => a.t - b.t)
    series.set(k, dedupe(merged))
  }
  const runs = (collected?.runs ?? []).map((m) => m * 60000)
  let firstAt: number | null = runs[0] ?? null
  for (const pts of series.values()) if (pts.length && (firstAt === null || pts[0].t < firstAt)) firstAt = pts[0].t
  return {
    series,
    stations: collected?.stations ?? {},
    runs,
    firstAt,
    updatedAt: collected?.updatedAt ?? null,
    hasCollector: !!collected,
  }
}

/** Drop consecutive points with an unchanged value. */
function dedupe(pts: Point[]) {
  const out: Point[] = []
  for (const p of pts) if (!out.length || out[out.length - 1].p !== p.p) out.push(p)
  return out
}

/** Value in effect at time t (undefined = before the first observation). */
export function valueAt(pts: Point[] | undefined, t: number): number | null | undefined {
  if (!pts?.length || t < pts[0].t) return undefined
  let lo = 0
  let hi = pts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (pts[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return pts[lo].p
}

/** Latest known (non-null) price at or before t. */
export function lastPriceAt(pts: Point[] | undefined, t: number) {
  if (!pts) return undefined
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].t <= t && pts[i].p !== null) return pts[i].p as number
  return undefined
}

export interface Change {
  from: number
  to: number
  diff: number // € per litre
  pct: number
}

/** Price change between `t - windowMs` and `t`. Undefined when either end is unknown. */
export function changeOver(pts: Point[] | undefined, t: number, windowMs: number): Change | undefined {
  const to = lastPriceAt(pts, t)
  const from = lastPriceAt(pts, t - windowMs)
  if (to === undefined || from === undefined) return undefined
  return { from, to, diff: to - from, pct: ((to - from) / from) * 100 }
}

/** Number of price changes within [start, end]. */
export function changesIn(pts: Point[] | undefined, start: number, end: number) {
  if (!pts) return { up: 0, down: 0 }
  let up = 0
  let down = 0
  let prev: number | undefined = lastPriceAt(pts, start)
  for (const p of pts) {
    if (p.t <= start || p.t > end || p.p === null) continue
    if (prev !== undefined) {
      if (p.p > prev) up++
      else if (p.p < prev) down++
    }
    prev = p.p
  }
  return { up, down }
}

/** Points within [start, end], with the value in effect at `start` prepended. */
export function sliceSeries(pts: Point[] | undefined, start: number, end: number): Point[] {
  if (!pts?.length) return []
  const inside = pts.filter((p) => p.t >= start && p.t <= end)
  const at = valueAt(pts, start)
  return at !== undefined && (!inside.length || inside[0].t > start) ? [{ t: start, p: at }, ...inside] : inside
}

const VIENNA = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23' })

export function viennaParts(t: number) {
  const parts = Object.fromEntries(VIENNA.formatToParts(new Date(t)).map((p) => [p.type, p.value]))
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday),
  }
}

/**
 * Aggregate a set of station series into min / avg / max per bucket.
 * Each station contributes the price in effect at each sample time.
 */
export function aggregate(seriesList: Point[][], start: number, end: number, stepMs: number) {
  const out: { t: number; min: number; avg: number; max: number; n: number }[] = []
  for (let t = start; t <= end; t += stepMs) {
    const vals: number[] = []
    for (const pts of seriesList) {
      const v = valueAt(pts, t)
      if (typeof v === 'number') vals.push(v)
    }
    if (vals.length) out.push({ t, min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length })
  }
  return out
}

/**
 * Typical price pattern by hour of day and weekday (Vienna time), as the average
 * deviation in cents from each station's own daily mean — positive = pricier.
 */
export function timePattern(seriesList: Point[][], start: number, end: number) {
  const HOUR = 3600_000
  const hourSum = Array(24).fill(0)
  const hourN = Array(24).fill(0)
  const daySum = Array(7).fill(0)
  const dayN = Array(7).fill(0)
  for (const pts of seriesList) {
    if (!pts.length) continue
    const from = Math.max(start, pts[0].t)
    // Group hourly samples per Vienna day so we can subtract that day's mean.
    const byDay = new Map<string, { hour: number; weekday: number; v: number }[]>()
    for (let t = Math.ceil(from / HOUR) * HOUR; t <= end; t += HOUR) {
      const v = valueAt(pts, t)
      if (typeof v !== 'number') continue
      const vp = viennaParts(t)
      const arr = byDay.get(vp.day) ?? []
      arr.push({ hour: vp.hour, weekday: vp.weekday, v })
      byDay.set(vp.day, arr)
    }
    const dailyMeans: { weekday: number; mean: number }[] = []
    for (const samples of byDay.values()) {
      if (samples.length < 12) continue // need most of the day to compare hours fairly
      const mean = samples.reduce((a, s) => a + s.v, 0) / samples.length
      for (const s of samples) {
        hourSum[s.hour] += (s.v - mean) * 100
        hourN[s.hour]++
      }
      dailyMeans.push({ weekday: samples[0].weekday, mean })
    }
    if (dailyMeans.length >= 7) {
      const overall = dailyMeans.reduce((a, d) => a + d.mean, 0) / dailyMeans.length
      for (const d of dailyMeans) {
        daySum[d.weekday] += (d.mean - overall) * 100
        dayN[d.weekday]++
      }
    }
  }
  return {
    hours: hourSum.map((s, h) => ({ hour: h, ct: hourN[h] ? s / hourN[h] : null, n: hourN[h] })),
    weekdays: daySum.map((s, d) => ({ day: d, ct: dayN[d] ? s / dayN[d] : null, n: dayN[d] })),
  }
}
