// Client for the E-Control "Spritpreisrechner" public API.
// Docs: https://api.e-control.at/sprit/1.0/doc/
// The API returns at most 10 stations per query and, by law, only the
// cheapest ~5 of them carry a price — the rest have an empty `prices` array.

const BASE = 'https://api.e-control.at/sprit/1.0'

export type FuelType = 'SUP' | 'DIE' | 'GAS'

export const FUEL_TYPES: { id: FuelType; label: string; short: string }[] = [
  { id: 'SUP', label: 'Super 95', short: 'Super' },
  { id: 'DIE', label: 'Diesel', short: 'Diesel' },
  { id: 'GAS', label: 'CNG (Erdgas)', short: 'CNG' },
]

export interface ApiOpeningHour {
  day: 'MO' | 'DI' | 'MI' | 'DO' | 'FR' | 'SA' | 'SO' | 'FE'
  label: string
  order: number
  from: string
  to: string
}

export interface ApiStation {
  id: number
  name: string
  location: {
    address: string
    postalCode: string
    city: string
    latitude: number
    longitude: number
  }
  contact?: { telephone?: string; mail?: string; website?: string }
  openingHours?: ApiOpeningHour[]
  offerInformation?: { service: boolean; selfService: boolean; unattended: boolean }
  otherServiceOffers?: string
  paymentMethods?: { cash: boolean; debitCard: boolean; creditCard: boolean; others?: string }
  paymentArrangements?: {
    cooperative: boolean
    clubCard: boolean
    clubCardText?: string
    accessMod?: string
  }
  position?: number
  open: boolean
  distance?: number
  prices: { fuelType: FuelType; amount: number; label: string }[]
}

export interface ApiRegion {
  code: number
  type: 'BL' | 'PB'
  name: string
  subRegions: ApiRegion[]
  postalCodes?: string[]
}

async function get<T>(path: string, params: Record<string, string | number | boolean>, signal?: AbortSignal) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const res = await fetch(`${BASE}${path}?${qs}`, { signal })
  if (!res.ok) throw new Error(`E-Control API ${res.status}: ${res.statusText}`)
  return (await res.json()) as T
}

export function searchByLocation(
  lat: number,
  lon: number,
  fuelType: FuelType,
  includeClosed: boolean,
  signal?: AbortSignal,
) {
  return get<ApiStation[]>(
    '/search/gas-stations/by-address',
    { latitude: lat.toFixed(5), longitude: lon.toFixed(5), fuelType, includeClosed },
    signal,
  )
}

export function searchByRegion(
  code: number,
  type: 'BL' | 'PB',
  fuelType: FuelType,
  includeClosed: boolean,
  signal?: AbortSignal,
) {
  return get<ApiStation[]>(
    '/search/gas-stations/by-region',
    { code, type, fuelType, includeClosed },
    signal,
  )
}

export function fetchRegions(signal?: AbortSignal) {
  return get<ApiRegion[]>('/regions', { includeCities: false }, signal)
}
