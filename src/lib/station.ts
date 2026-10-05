import type { ApiStation, FuelType } from '../api/econtrol'
import { brandOf } from './brand'
import { haversineKm, type LatLon } from './geo'
import { is24h, openStatus } from './hours'

export interface Station {
  id: number
  name: string
  brand: string
  address: string
  postalCode: string
  city: string
  lat: number
  lon: number
  distance: number
  apiOpen: boolean
  openNow: boolean | null
  openLabel: string
  open24h: boolean
  raw: ApiStation
  prices: Partial<Record<FuelType, number>>
  /** Fuel types that were queried for this station (to tell "no price" from "not queried"). */
  queried: Set<FuelType>
}

/** Merge the result lists of many (point × fuelType) queries into one station list. */
export function mergeStations(
  results: { fuelType: FuelType; stations: ApiStation[] }[],
  origin: LatLon | null,
): Station[] {
  const map = new Map<number, Station>()
  for (const { fuelType, stations } of results) {
    for (const s of stations) {
      let st = map.get(s.id)
      if (!st) {
        const status = openStatus(s.openingHours)
        st = {
          id: s.id,
          name: s.name.trim(),
          brand: brandOf(s.name),
          address: s.location.address,
          postalCode: s.location.postalCode,
          city: s.location.city,
          lat: s.location.latitude,
          lon: s.location.longitude,
          distance: origin
            ? haversineKm(origin, { lat: s.location.latitude, lon: s.location.longitude })
            : (s.distance ?? 0),
          apiOpen: s.open,
          openNow: status.open ?? s.open,
          openLabel: status.label,
          open24h: is24h(s.openingHours),
          raw: s,
          prices: {},
          queried: new Set(),
        }
        map.set(s.id, st)
      }
      st.queried.add(fuelType)
      const p = s.prices.find((x) => x.fuelType === fuelType)
      if (p) st.prices[fuelType] = p.amount
    }
  }
  return [...map.values()]
}

export function fmtPrice(n: number | undefined, digits = 3) {
  return n === undefined ? '—' : `€ ${n.toFixed(digits)}`
}

export function fmtKm(n: number) {
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`
}
