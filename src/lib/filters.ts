import type { FuelType } from '../api/econtrol'
import type { Station } from './station'

export type SortKey = 'price' | 'distance' | 'effective' | 'name' | 'brand'
export type ServiceKind = 'service' | 'selfService' | 'unattended'
export type PaymentKind = 'cash' | 'debitCard' | 'creditCard'
export type OpenFilter = 'any' | 'now' | '24h'

export interface Filters {
  fuel: FuelType
  query: string
  maxPrice: number | null
  maxDistance: number | null
  brands: string[]
  cities: string[]
  open: OpenFilter
  pricedOnly: boolean
  services: ServiceKind[]
  payments: PaymentKind[]
  clubCard: boolean
  cooperative: boolean
  favoritesOnly: boolean
  sort: SortKey
  sortDir: 'asc' | 'desc'
}

export const DEFAULT_FILTERS: Filters = {
  fuel: 'SUP',
  query: '',
  maxPrice: null,
  maxDistance: null,
  brands: [],
  cities: [],
  open: 'any',
  pricedOnly: false,
  services: [],
  payments: [],
  clubCard: false,
  cooperative: false,
  favoritesOnly: false,
  sort: 'price',
  sortDir: 'asc',
}

export interface TripSettings {
  tankLitres: number
  consumption: number // l / 100 km
}

/** Cost of a fill-up including the fuel burnt driving there and back. */
export function effectiveCost(price: number | undefined, distanceKm: number, trip: TripSettings) {
  if (price === undefined) return undefined
  const detourLitres = (distanceKm * 2 * trip.consumption) / 100
  return price * (trip.tankLitres + detourLitres)
}

export function countActive(f: Filters) {
  let n = 0
  if (f.query) n++
  if (f.maxPrice !== null) n++
  if (f.maxDistance !== null) n++
  if (f.brands.length) n++
  if (f.cities.length) n++
  if (f.open !== 'any') n++
  if (f.pricedOnly) n++
  if (f.services.length) n++
  if (f.payments.length) n++
  if (f.clubCard) n++
  if (f.cooperative) n++
  if (f.favoritesOnly) n++
  return n
}

export function applyFilters(
  stations: Station[],
  f: Filters,
  favorites: Set<number>,
  trip: TripSettings,
) {
  const q = f.query.trim().toLowerCase()
  const out = stations.filter((s) => {
    const price = s.prices[f.fuel]
    // Other fuel-type queries only enrich prices; the station set comes from the selected fuel's search.
    if (!s.queried.has(f.fuel)) return false
    if (q && !`${s.name} ${s.address} ${s.city} ${s.postalCode} ${s.brand}`.toLowerCase().includes(q)) return false
    if (f.pricedOnly && price === undefined) return false
    if (f.maxPrice !== null && (price === undefined || price > f.maxPrice)) return false
    if (f.maxDistance !== null && s.distance > f.maxDistance) return false
    if (f.brands.length && !f.brands.includes(s.brand)) return false
    if (f.cities.length && !f.cities.includes(s.city)) return false
    if (f.open === 'now' && s.openNow === false) return false
    if (f.open === '24h' && !s.open24h) return false
    const offer = s.raw.offerInformation
    if (f.services.length && !f.services.some((k) => offer?.[k])) return false
    const pay = s.raw.paymentMethods
    if (f.payments.length && !f.payments.every((k) => pay?.[k])) return false
    if (f.clubCard && !s.raw.paymentArrangements?.clubCard) return false
    if (f.cooperative && !s.raw.paymentArrangements?.cooperative) return false
    if (f.favoritesOnly && !favorites.has(s.id)) return false
    return true
  })

  const dir = f.sortDir === 'asc' ? 1 : -1
  // Stations without a price always sink to the bottom when sorting by price.
  const num = (v: number | undefined) => (v === undefined ? Infinity : v)
  out.sort((a, b) => {
    switch (f.sort) {
      case 'price': {
        const pa = a.prices[f.fuel]
        const pb = b.prices[f.fuel]
        if (pa === undefined || pb === undefined) return num(pa) - num(pb) || a.distance - b.distance
        return (pa - pb) * dir || a.distance - b.distance
      }
      case 'effective': {
        const ea = effectiveCost(a.prices[f.fuel], a.distance, trip)
        const eb = effectiveCost(b.prices[f.fuel], b.distance, trip)
        if (ea === undefined || eb === undefined) return num(ea) - num(eb)
        return (ea - eb) * dir
      }
      case 'distance':
        return (a.distance - b.distance) * dir
      case 'name':
        return a.name.localeCompare(b.name) * dir
      case 'brand':
        return a.brand.localeCompare(b.brand) * dir || num(a.prices[f.fuel]) - num(b.prices[f.fuel])
    }
  })
  return out
}

export function priceStats(stations: Station[], fuel: FuelType) {
  const prices = stations.map((s) => s.prices[fuel]).filter((p): p is number => p !== undefined).sort((a, b) => a - b)
  if (!prices.length) return null
  const sum = prices.reduce((a, b) => a + b, 0)
  const mid = Math.floor(prices.length / 2)
  return {
    count: prices.length,
    min: prices[0],
    max: prices[prices.length - 1],
    avg: sum / prices.length,
    median: prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2,
  }
}

/** 0 = cheapest, 1 = most expensive within the current result set. */
export function priceRank(price: number | undefined, min: number, max: number) {
  if (price === undefined) return null
  return max === min ? 0 : (price - min) / (max - min)
}

export function rankColor(rank: number | null) {
  if (rank === null) return '#94a3b8'
  // green → amber → red
  const hue = 140 - rank * 135
  return `hsl(${hue} 70% 42%)`
}
