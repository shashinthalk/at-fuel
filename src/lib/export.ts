import { FUEL_TYPES } from '../api/econtrol'
import type { Station } from './station'

export function exportCsv(stations: Station[], filename = 'fuel-prices.csv') {
  const header = ['Name', 'Brand', 'Address', 'Postcode', 'City', ...FUEL_TYPES.map((f) => f.label), 'Distance km', 'Open now', 'Latitude', 'Longitude']
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = stations.map((s) => [
    s.name,
    s.brand,
    s.address,
    s.postalCode,
    s.city,
    ...FUEL_TYPES.map((f) => s.prices[f.id]?.toFixed(3) ?? ''),
    s.distance.toFixed(2),
    s.openNow === null ? '' : s.openNow ? 'yes' : 'no',
    s.lat,
    s.lon,
  ])
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
