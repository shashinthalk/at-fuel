#!/usr/bin/env node
// Builds price summaries per area and fuel from the recorded history
// (public/history/prices.json). Runs after every collection.
//
//   public/history/daily.json          today: low / avg / high and the cheapest stations
//   public/history/weeks/week-1.json   this week (Mon–Sun), day by day + the lowest day
//   public/history/weeks/week-2..4     the three weeks before
//   public/history/months.json         per month: the day with the lowest price and how much
//
// All days are calendar days in Austrian time (Europe/Vienna). Everything is
// recomputed from prices.json on each run, so the files never drift. Months
// that are no longer in prices.json are kept from the previous months.json.
//
//   npm run history:rollup

import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// HISTORY_DIR lets the Docker collector write to a shared volume.
const HISTORY = process.env.HISTORY_DIR ?? join(ROOT, 'public', 'history')
const PRICES = join(HISTORY, 'prices.json')
const CONFIG = join(ROOT, 'collector', 'config.json')
const FUELS = ['SUP', 'DIE', 'GAS']
const WEEKS = 4
const ALL = 'All areas' // pseudo-area: every tracked station
const HOUR = 3600_000
const TOP = 5 // cheapest stations listed in daily.json

// --- Vienna calendar -----------------------------------------------------------
const VIENNA = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })

function viennaParts(t) {
  const p = Object.fromEntries(VIENNA.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

/** Start of a Vienna calendar day in ms (handles DST). */
function dayStart(day) {
  let t = Date.parse(`${day}T00:00:00Z`) - 2 * HOUR // Vienna is UTC+1 or +2
  while (viennaParts(t).day !== day || viennaParts(t).hour !== 0) t += HOUR
  return t
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const weekday = (day) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7 // 0 = Monday
const monday = (day) => addDays(day, -weekday(day))

// --- stats -----------------------------------------------------------------------
const euro = (v) => Math.round(v * 1000) / 1000

/**
 * Stats for one station series over [from, to): exact time-weighted average,
 * lowest / highest price and when the lowest price started. Null prices
 * (station listed without a published price) are skipped.
 */
function seriesStats(pts, from, to) {
  let lo = null
  let hi = null
  let sum = 0
  let dur = 0
  for (let i = 0; i < pts.length; i++) {
    const [m, v] = pts[i]
    const a = Math.max(m * 60000, from)
    const b = Math.min(i + 1 < pts.length ? pts[i + 1][0] * 60000 : Infinity, to)
    if (b <= a || v === null) continue
    const p = v / 1000
    sum += p * (b - a)
    dur += b - a
    if (!lo || p < lo.price) lo = { price: p, at: a }
    if (hi === null || p > hi) hi = p
  }
  return dur ? { low: lo, high: hi, avg: sum / dur, hours: dur / HOUR } : null
}

/** Price in effect at time t, or null. */
function priceAt(pts, t) {
  let v = null
  for (const [m, x] of pts) {
    if (m * 60000 > t) break
    v = x
  }
  return v === null ? null : v / 1000
}

function stationRef(id, info) {
  return { id: Number(id), name: info?.name ?? `Station ${id}`, city: info?.city ?? '' }
}

/** Day summary for a set of station ids, or null without data. */
function daySummary(store, ids, fuel, from, to) {
  let low = null
  let high = null
  const avgs = []
  let hours = 0
  for (const id of ids) {
    const pts = store.series[`${id}:${fuel}`]
    if (!pts?.length) continue
    const s = seriesStats(pts, from, to)
    if (!s) continue
    avgs.push(s.avg)
    hours = Math.max(hours, s.hours)
    if (!low || s.low.price < low.price || (s.low.price === low.price && s.low.at < low.at)) low = { ...s.low, id }
    if (high === null || s.high > high) high = s.high
  }
  if (!avgs.length) return null
  return {
    low: euro(low.price),
    lowAt: new Date(low.at).toISOString(),
    lowStation: stationRef(low.id, store.stations[low.id]),
    avg: euro(avgs.reduce((a, b) => a + b, 0) / avgs.length),
    high: euro(high),
    stations: avgs.length,
    // Days with less than 20 recorded hours are partial (collector started/stopped, or today).
    partial: hours < 20,
  }
}

/** The day with the lowest price (earliest one on a tie). */
function lowestDay(days) {
  let best = null
  for (const d of days) if (d.low !== undefined && (!best || d.low < best.low)) best = d
  return best && { day: best.day, price: best.low, at: best.lowAt, station: best.lowStation }
}

// --- areas -----------------------------------------------------------------------
async function areaMembers(store) {
  const config = JSON.parse(await readFile(CONFIG, 'utf8'))
  const members = { [ALL]: Object.keys(store.stations) }
  for (const a of config.areas) members[a.name] = []
  for (const [id, s] of Object.entries(store.stations)) {
    for (const name of s.areas ?? []) (members[name] ??= []).push(id)
  }
  // Drop areas that no station has been tagged with yet.
  return Object.fromEntries(Object.entries(members).filter(([, ids]) => ids.length))
}

// --- files -----------------------------------------------------------------------
async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, JSON.stringify(data))
  await rename(`${file}.tmp`, file)
}

export async function rollup() {
  if (!existsSync(PRICES)) return console.log('Rollup: no prices.json yet.')
  const store = JSON.parse(await readFile(PRICES, 'utf8'))
  const firstRun = (store.runs[0] ?? 0) * 60000
  const lastRun = store.updatedAt || (store.runs.at(-1) ?? 0) * 60000
  if (!lastRun) return console.log('Rollup: no runs recorded yet.')

  const areas = await areaMembers(store)
  const today = viennaParts(lastRun).day
  const firstDay = viennaParts(firstRun).day
  const generatedAt = new Date().toISOString()

  // Per-day summaries for every recorded day: area -> fuel -> day -> summary.
  const days = {}
  for (let day = firstDay; day <= today; day = addDays(day, 1)) {
    const from = Math.max(dayStart(day), firstRun)
    const to = Math.min(dayStart(addDays(day, 1)), lastRun)
    if (to <= from) continue
    for (const [area, ids] of Object.entries(areas)) {
      for (const fuel of FUELS) {
        const s = daySummary(store, ids, fuel, from, to)
        if (s) ((days[area] ??= {})[fuel] ??= {})[day] = s
      }
    }
  }
  const dayList = (area, fuel, from, to) =>
    Object.entries(days[area]?.[fuel] ?? {})
      .filter(([d]) => d >= from && d <= to)
      .map(([day, s]) => ({ day, weekday: weekday(day), ...s }))

  // daily.json — today
  const daily = { day: today, updatedAt: new Date(lastRun).toISOString(), generatedAt, areas: {} }
  for (const [area, ids] of Object.entries(areas)) {
    for (const fuel of FUELS) {
      const s = days[area]?.[fuel]?.[today]
      if (!s) continue
      const current = ids
        .map((id) => ({ id, price: priceAt(store.series[`${id}:${fuel}`] ?? [], lastRun) }))
        .filter((x) => x.price !== null)
        .sort((a, b) => a.price - b.price)
        .slice(0, TOP)
        .map((x) => ({ ...stationRef(x.id, store.stations[x.id]), price: euro(x.price) }))
      ;(daily.areas[area] ??= {})[fuel] = { ...s, cheapestNow: current }
    }
  }
  await writeJson(join(HISTORY, 'daily.json'), daily)

  // weeks/week-1..4.json — week-1 is the current week
  const thisMonday = monday(today)
  for (let w = 0; w < WEEKS; w++) {
    const start = addDays(thisMonday, -7 * w)
    const end = addDays(start, 6)
    const week = { week: w + 1, start, end, generatedAt, areas: {} }
    for (const area of Object.keys(areas)) {
      for (const fuel of FUELS) {
        const list = dayList(area, fuel, start, end)
        if (list.length) (week.areas[area] ??= {})[fuel] = { lowest: lowestDay(list), days: list }
      }
    }
    await writeJson(join(HISTORY, 'weeks', `week-${w + 1}.json`), week)
  }

  // months.json — keep older months, recompute the ones we have data for
  const monthsFile = join(HISTORY, 'months.json')
  const prev = existsSync(monthsFile) ? JSON.parse(await readFile(monthsFile, 'utf8')) : { months: {} }
  const months = { ...prev.months }
  for (let m = firstDay.slice(0, 7); m <= today.slice(0, 7); ) {
    const entry = { areas: {} }
    for (const area of Object.keys(areas)) {
      for (const fuel of FUELS) {
        const list = dayList(area, fuel, `${m}-01`, `${m}-31`)
        if (!list.length) continue
        const highest = list.reduce((a, b) => (b.high > a.high ? b : a))
        ;(entry.areas[area] ??= {})[fuel] = {
          lowest: lowestDay(list),
          highest: { day: highest.day, price: highest.high },
          avg: euro(list.reduce((a, d) => a + d.avg, 0) / list.length),
          days: list.length,
          // Lowest price of each recorded day, for a month calendar.
          daily: Object.fromEntries(list.map((d) => [d.day.slice(8), d.low])),
        }
      }
    }
    // A month only partly left in prices.json must not overwrite a fuller record.
    for (const [area, fuels] of Object.entries(months[m]?.areas ?? {})) {
      for (const [fuel, old] of Object.entries(fuels)) {
        const cur = entry.areas[area]?.[fuel]
        if (!cur || old.days > cur.days) (entry.areas[area] ??= {})[fuel] = old
      }
    }
    if (Object.keys(entry.areas).length) months[m] = entry
    const [y, mo] = m.split('-').map(Number)
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  }
  await writeJson(monthsFile, { generatedAt, months: Object.fromEntries(Object.entries(months).sort(([a], [b]) => a.localeCompare(b))) })

  console.log(`Rollup: ${Object.keys(areas).length} areas, today ${today}, weeks from ${addDays(thisMonday, -7 * (WEEKS - 1))}, ${Object.keys(months).length} month(s).`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await rollup()
}
