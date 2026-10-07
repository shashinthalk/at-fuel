#!/usr/bin/env node
// Price-history collector for the E-Control fuel price API.
//
// The API only returns *current* prices, so history has to be recorded.
// Each run queries the areas in collector/config.json for every fuel type
// and appends a point to a station's series only when its price changes.
// Output: public/history/prices.json (read by the app's "Trends" view), then
// the daily / weekly / monthly summaries (see rollup.mjs).
//
//   npm run collect                 # one snapshot
//   npm run collect -- --watch 30   # keep running, snapshot every 30 minutes

import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rollup } from './rollup.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = join(ROOT, 'collector', 'config.json')
// HISTORY_DIR lets the Docker collector write to a shared volume.
const OUT = join(process.env.HISTORY_DIR ?? join(ROOT, 'public', 'history'), 'prices.json')
const API = 'https://api.e-control.at/sprit/1.0'
const FUELS = ['SUP', 'DIE', 'GAS']
const MAX_RUNS = 20000
const CONCURRENCY = 4

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- geometry (mirrors src/lib/geo.ts) --------------------------------------
function offset(o, distKm, bearingDeg) {
  const R = 6371
  const rad = (d) => (d * Math.PI) / 180
  const deg = (r) => (r * 180) / Math.PI
  const δ = distKm / R
  const θ = rad(bearingDeg)
  const φ1 = rad(o.lat)
  const λ1 = rad(o.lon)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: deg(φ2), lon: deg(λ2) }
}

function scanPoints(center, mode = 'single') {
  const pts = [center]
  if (mode === 'single') return pts
  for (let i = 0; i < 6; i++) pts.push(offset(center, 8, i * 60))
  if (mode === 'xwide') for (let i = 0; i < 12; i++) pts.push(offset(center, 16, i * 30))
  return pts
}

// --- API ---------------------------------------------------------------------
async function get(path, params, attempt = 1) {
  const url = `${API}${path}?${new URLSearchParams(params)}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (attempt >= 3) throw new Error(`${url}: ${err.message}`)
    await sleep(1000 * attempt)
    return get(path, params, attempt + 1)
  }
}

function jobsFor(area) {
  const jobs = []
  for (const fuel of area.fuels ?? FUELS) {
    if (area.region) {
      jobs.push({ area: area.name, fuel, path: '/search/gas-stations/by-region', params: { code: area.region.code, type: area.region.type, fuelType: fuel, includeClosed: true } })
    } else {
      for (const p of scanPoints({ lat: area.lat, lon: area.lon }, area.scan)) {
        jobs.push({ area: area.name, fuel, path: '/search/gas-stations/by-address', params: { latitude: p.lat.toFixed(5), longitude: p.lon.toFixed(5), fuelType: fuel, includeClosed: true } })
      }
    }
  }
  return jobs
}

async function runPool(jobs, worker) {
  const results = []
  let i = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < jobs.length) {
        const job = jobs[i++]
        try {
          results.push({ job, data: await worker(job) })
        } catch (err) {
          results.push({ job, error: err.message })
        }
        await sleep(150) // be polite to the public API
      }
    }),
  )
  return results
}

// --- storage -----------------------------------------------------------------
async function load() {
  if (!existsSync(OUT)) return { version: 1, createdAt: Date.now(), updatedAt: 0, runs: [], stations: {}, series: {} }
  return JSON.parse(await readFile(OUT, 'utf8'))
}

async function save(store) {
  await mkdir(dirname(OUT), { recursive: true })
  const tmp = `${OUT}.tmp`
  await writeFile(tmp, JSON.stringify(store))
  await rename(tmp, OUT)
}

// --- one collection run --------------------------------------------------------
async function collect() {
  const config = JSON.parse(await readFile(CONFIG, 'utf8'))
  const jobs = config.areas.flatMap(jobsFor)
  const started = Date.now()
  const results = await runPool(jobs, (j) => get(j.path, j.params))

  // Deduplicate: the same station can appear in several overlapping queries.
  const observed = new Map() // `${id}:${fuel}` -> price (number | null)
  const store = await load()
  for (const { job, data } of results) {
    if (!Array.isArray(data)) continue
    for (const s of data) {
      if (!s?.id || !s.location) continue
      // Areas the station was found in (for the per-area summaries); kept across runs.
      const areas = new Set([...(store.stations[s.id]?.areas ?? []), job.area])
      store.stations[s.id] = {
        name: (s.name ?? 'Unnamed station').trim(),
        address: s.location.address,
        postalCode: s.location.postalCode,
        city: s.location.city,
        lat: s.location.latitude,
        lon: s.location.longitude,
        areas: [...areas],
      }
      const price = s.prices?.find((p) => p.fuelType === job.fuel)?.amount
      const key = `${s.id}:${job.fuel}`
      // A price beats "no price" if overlapping queries disagree.
      if (price !== undefined || !observed.has(key)) observed.set(key, price ?? null)
    }
  }

  const minute = Math.floor(started / 60000)
  let changes = 0
  for (const [key, price] of observed) {
    const value = price === null ? null : Math.round(price * 1000) // tenths of a cent
    const series = (store.series[key] ??= [])
    const last = series[series.length - 1]
    if (!last || last[1] !== value) {
      series.push([minute, value])
      changes++
    }
  }

  store.runs.push(minute)
  store.runs = store.runs.slice(-MAX_RUNS)
  store.updatedAt = started
  await save(store)

  const failed = results.filter((r) => r.error)
  const priced = [...observed.values()].filter((v) => v !== null).length
  console.log(
    `[${new Date(started).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}] ` +
      `${jobs.length} requests, ${observed.size} station/fuel pairs (${priced} priced), ${changes} changes recorded` +
      (failed.length ? `, ${failed.length} failed (${failed[0].error})` : ''),
  )
}

// --- CLI -----------------------------------------------------------------------
const watchIdx = process.argv.indexOf('--watch')
const intervalMin = watchIdx >= 0 ? Number(process.argv[watchIdx + 1] ?? 30) : 0

const run = () =>
  collect()
    .then(rollup)
    .catch((e) => console.error('Run failed:', e.message))

await run()
if (intervalMin > 0) {
  console.log(`Watching: next snapshot every ${intervalMin} min. Press Ctrl+C to stop.`)
  setInterval(run, intervalMin * 60000)
}
