#!/usr/bin/env node
// Imports official weekly average pump prices for Austria (and the EU average)
// from the European Commission's Weekly Oil Bulletin, 2005 – today.
// Output: public/history/national.json
//
//   npm run history:national

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSheet } from 'read-excel-file/node'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'history', 'national.json')
const SOURCE =
  'https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx'

console.log('Downloading EU Weekly Oil Bulletin history…')
const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
const buf = Buffer.from(await res.arrayBuffer())

const rows = await readSheet(buf, 'Prices with taxes')
const header = rows[0].map((h) => String(h ?? ''))
const col = (name) => {
  const i = header.indexOf(name)
  if (i < 0) throw new Error(`Column ${name} not found — the bulletin layout may have changed`)
  return i
}
const cols = {
  at95: col('AT_price_with_tax_euro95'),
  atDie: col('AT_price_with_tax_diesel'),
  eu95: col('EU_price_with_tax_euro95'),
  euDie: col('EU_price_with_tax_diesel'),
}

// Prices are € per 1000 litres; convert to € per litre.
const perLitre = (v) => (typeof v === 'number' && v > 0 ? Math.round(v) / 1000 : null)

const weeks = rows
  .slice(1)
  .filter((r) => r[0] instanceof Date)
  .map((r) => ({
    d: r[0].toISOString().slice(0, 10),
    at95: perLitre(r[cols.at95]),
    atDie: perLitre(r[cols.atDie]),
    eu95: perLitre(r[cols.eu95]),
    euDie: perLitre(r[cols.euDie]),
  }))
  .filter((w) => w.at95 !== null || w.atDie !== null)
  .sort((a, b) => a.d.localeCompare(b.d))

await mkdir(dirname(OUT), { recursive: true })
await writeFile(
  OUT,
  JSON.stringify({
    source: 'European Commission – Weekly Oil Bulletin (prices with taxes)',
    sourceUrl: 'https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en',
    importedAt: new Date().toISOString(),
    weeks,
  }),
)
console.log(`Saved ${weeks.length} weeks (${weeks[0]?.d} → ${weeks.at(-1)?.d}) to public/history/national.json`)
