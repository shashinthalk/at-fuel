// Day-by-day statistics and a simple next-week forecast built from recorded
// price history. All days are calendar days in Austrian time (Europe/Vienna).
import { valueAt, viennaParts, type Point } from './historyData'

const HOUR = 3600_000
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export interface DayStat {
  day: string // YYYY-MM-DD (Vienna)
  weekday: number // 0 = Monday
  avg: number // average of the stations' time-weighted daily averages
  low: number // lowest price seen that day
  high: number // highest price seen that day
  stations: number
  hours: number // hours of the day with data (24 = full day)
  partial: boolean
}

/**
 * Daily statistics over a set of station series. Each station is sampled hourly;
 * its daily average is the mean of those samples (≈ time-weighted average).
 */
export function dailyStats(seriesList: Point[][], start: number, end: number): DayStat[] {
  const days = new Map<string, { weekday: number; stationAvgs: number[]; low: number; high: number; hours: Set<number> }>()
  for (const pts of seriesList) {
    if (!pts?.length) continue
    const perDay = new Map<string, { weekday: number; vals: number[]; hours: number[] }>()
    for (let t = Math.ceil(Math.max(start, pts[0].t) / HOUR) * HOUR; t <= end; t += HOUR) {
      const v = valueAt(pts, t)
      if (typeof v !== 'number') continue
      const vp = viennaParts(t)
      const d = perDay.get(vp.day) ?? { weekday: vp.weekday, vals: [], hours: [] }
      d.vals.push(v)
      d.hours.push(vp.hour)
      perDay.set(vp.day, d)
    }
    for (const [day, d] of perDay) {
      const agg = days.get(day) ?? { weekday: d.weekday, stationAvgs: [], low: Infinity, high: -Infinity, hours: new Set<number>() }
      agg.stationAvgs.push(d.vals.reduce((a, b) => a + b, 0) / d.vals.length)
      agg.low = Math.min(agg.low, ...d.vals)
      agg.high = Math.max(agg.high, ...d.vals)
      d.hours.forEach((h) => agg.hours.add(h))
      days.set(day, agg)
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({
      day,
      weekday: d.weekday,
      avg: d.stationAvgs.reduce((a, b) => a + b, 0) / d.stationAvgs.length,
      low: d.low,
      high: d.high,
      stations: d.stationAvgs.length,
      hours: d.hours.size,
      partial: d.hours.size < 20,
    }))
}

/** Monday (YYYY-MM-DD) of the week containing `day`. */
export function weekStart(day: string) {
  const d = new Date(`${day}T12:00:00Z`)
  const wd = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - wd)
  return d.toISOString().slice(0, 10)
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: '2-digit' }) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('de-AT', { ...opts, timeZone: 'UTC' })
}

/** Group daily stats into Monday-based weeks: rows = weeks, 7 cells each. */
export function weekGrid(days: DayStat[]) {
  const weeks = new Map<string, (DayStat | null)[]>()
  for (const d of days) {
    const ws = weekStart(d.day)
    const row = weeks.get(ws) ?? Array(7).fill(null)
    row[d.weekday] = d
    weeks.set(ws, row)
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, cells]) => ({ start, cells }))
}

export type Metric = 'avg' | 'low'

export interface Forecast {
  days: { day: string; weekday: number; value: number; low: number; high: number }[]
  weekdayOffsets: (number | null)[] // € vs. the trend line, per weekday
  cheapestWins: number[] // how often each weekday was the cheapest day of a full week
  fullWeeks: number
  slopePerWeek: number // € per week
  spread: number // ± € (1 std of residuals)
  confidence: 'none' | 'low' | 'medium' | 'good'
  basisDays: number
  best: { day: string; weekday: number; value: number } | null
  worst: { day: string; weekday: number; value: number } | null
}

/**
 * Forecast the next 7 days: linear trend over the period + the average
 * weekday deviation from that trend. Deliberately simple and explainable —
 * it captures weekly habits, not oil-market shocks.
 */
export function forecastNextWeek(days: DayStat[], metric: Metric, today: string): Forecast {
  const full = days.filter((d) => !d.partial)
  const empty: Forecast = {
    days: [],
    weekdayOffsets: Array(7).fill(null),
    cheapestWins: Array(7).fill(0),
    fullWeeks: 0,
    slopePerWeek: 0,
    spread: 0,
    confidence: 'none',
    basisDays: full.length,
    best: null,
    worst: null,
  }
  if (full.length < 5) return empty

  const t0 = new Date(`${full[0].day}T12:00:00Z`).getTime()
  const x = (day: string) => (new Date(`${day}T12:00:00Z`).getTime() - t0) / (24 * HOUR)
  const xs = full.map((d) => x(d.day))
  const ys = full.map((d) => d[metric])
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const sxx = xs.reduce((a, v) => a + (v - mx) ** 2, 0)
  // Dampen the trend: half-weight it when there is less than two weeks of data.
  const rawSlope = sxx > 0 ? xs.reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0) / sxx : 0
  const slope = n < 14 ? rawSlope * 0.5 : rawSlope
  const intercept = my - slope * mx

  const resid = full.map((d, i) => ({ weekday: d.weekday, r: ys[i] - (intercept + slope * xs[i]) }))
  const offsets: (number | null)[] = Array.from({ length: 7 }, (_, wd) => {
    const rs = resid.filter((r) => r.weekday === wd).map((r) => r.r)
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null
  })
  const leftover = resid.map((r) => r.r - (offsets[r.weekday] ?? 0))
  const spread = Math.sqrt(leftover.reduce((a, v) => a + v * v, 0) / Math.max(1, leftover.length - 1))

  // Which weekday was cheapest in each complete week?
  const wins = Array(7).fill(0)
  let fullWeeks = 0
  for (const w of weekGrid(full)) {
    if (w.cells.some((c) => !c)) continue
    fullWeeks++
    const vals = w.cells.map((c) => c![metric])
    wins[vals.indexOf(Math.min(...vals))]++
  }

  const out = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i + 1)
    const wd = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
    const value = intercept + slope * x(day) + (offsets[wd] ?? 0)
    return { day, weekday: wd, value, low: value - spread, high: value + spread }
  })
  const known = out.filter((d) => offsets[d.weekday] !== null)
  const pick = (cmp: (a: number, b: number) => boolean) =>
    known.length ? known.reduce((m, d) => (cmp(d.value, m.value) ? d : m)) : null

  const coveredWeekdays = offsets.filter((o) => o !== null).length
  const confidence: Forecast['confidence'] =
    coveredWeekdays < 7 || full.length < 7 ? 'low' : full.length < 14 ? 'low' : full.length < 21 ? 'medium' : 'good'

  return {
    days: out,
    weekdayOffsets: offsets,
    cheapestWins: wins,
    fullWeeks,
    slopePerWeek: slope * 7,
    spread,
    confidence,
    basisDays: full.length,
    best: pick((a, b) => a < b),
    worst: pick((a, b) => a > b),
  }
}
