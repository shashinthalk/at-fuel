export interface LatLon {
  lat: number
  lon: number
}

const R = 6371

export function haversineKm(a: LatLon, b: LatLon) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Point at `distKm` from `origin` in direction `bearingDeg`. */
export function offset(origin: LatLon, distKm: number, bearingDeg: number): LatLon {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const δ = distKm / R
  const θ = toRad(bearingDeg)
  const φ1 = toRad(origin.lat)
  const λ1 = toRad(origin.lon)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: toDeg(φ2), lon: toDeg(λ2) }
}

export type ScanMode = 'single' | 'wide' | 'xwide'

export const SCAN_MODES: { id: ScanMode; label: string; hint: string }[] = [
  { id: 'single', label: 'Nearby', hint: '1 query · ~10 stations' },
  { id: 'wide', label: 'Wide', hint: '7 queries · ring at 8 km' },
  { id: 'xwide', label: 'Extra wide', hint: '19 queries · rings at 8 & 16 km' },
]

/**
 * The API only ever returns the 10 closest stations, so to cover a larger
 * area we query a hexagonal set of points around the centre and merge.
 */
export function scanPoints(center: LatLon, mode: ScanMode): LatLon[] {
  const pts = [center]
  if (mode === 'single') return pts
  for (let i = 0; i < 6; i++) pts.push(offset(center, 8, i * 60))
  if (mode === 'xwide') for (let i = 0; i < 12; i++) pts.push(offset(center, 16, i * 30))
  return pts
}
