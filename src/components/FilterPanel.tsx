import { RotateCcw, Search } from 'lucide-react'
import { useMemo } from 'react'
import { brandColor } from '../lib/brand'
import {
  countActive,
  DEFAULT_FILTERS,
  type Filters,
  type PaymentKind,
  type ServiceKind,
  type TripSettings,
} from '../lib/filters'
import type { Station } from '../lib/station'
import { Chip, NumberField, RangeField, Section, Segmented, Switch } from './ui'

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

const SERVICES: { id: ServiceKind; label: string }[] = [
  { id: 'service', label: 'Attended service' },
  { id: 'selfService', label: 'Self-service' },
  { id: 'unattended', label: 'Unattended / automat' },
]
const PAYMENTS: { id: PaymentKind; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'debitCard', label: 'Debit card' },
  { id: 'creditCard', label: 'Credit card' },
]

export function FilterPanel({
  stations,
  filters,
  setFilters,
  trip,
  setTrip,
  favoriteCount,
  isRegion,
}: {
  stations: Station[]
  filters: Filters
  setFilters: (f: Filters | ((f: Filters) => Filters)) => void
  trip: TripSettings
  setTrip: (t: TripSettings) => void
  favoriteCount: number
  isRegion: boolean
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  const facets = useMemo(() => {
    const pool = stations.filter((s) => s.queried.has(filters.fuel))
    const count = (key: (s: Station) => string) => {
      const m = new Map<string, number>()
      pool.forEach((s) => m.set(key(s), (m.get(key(s)) ?? 0) + 1))
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    }
    const prices = pool.map((s) => s.prices[filters.fuel]).filter((p): p is number => p !== undefined)
    return {
      brands: count((s) => s.brand),
      cities: count((s) => s.city),
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      maxDist: Math.ceil(Math.max(1, ...pool.map((s) => s.distance))),
    }
  }, [stations, filters.fuel])

  const active = countActive(filters)

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">
          Filters {active > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-xs text-white">{active}</span>}
        </h2>
        {active > 0 && (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, fuel: f.fuel, sort: f.sort, sortDir: f.sortDir }))}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <RotateCcw className="size-3" /> Reset all
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
        <input
          value={filters.query}
          onChange={(e) => set('query', e.target.value)}
          placeholder="Filter by name, street, city…"
          className="w-full rounded-lg border border-line bg-surface py-2 pr-2 pl-8 text-sm outline-none focus:border-accent"
        />
      </div>

      <Section title="Price & distance">
        <RangeField
          label="Max price / litre"
          value={filters.maxPrice}
          min={Math.floor(facets.minPrice * 100) / 100}
          max={Math.ceil(facets.maxPrice * 100) / 100}
          step={0.001}
          format={(n) => `€ ${n.toFixed(3)}`}
          onChange={(v) => set('maxPrice', v)}
        />
        {!isRegion && (
          <RangeField
            label="Max distance"
            value={filters.maxDistance}
            min={1}
            max={facets.maxDist}
            step={0.5}
            format={(n) => `${n} km`}
            onChange={(v) => set('maxDistance', v)}
          />
        )}
        <Switch checked={filters.pricedOnly} onChange={(v) => set('pricedOnly', v)} label="Only stations with a price" hint="The API only reports prices for the cheapest stations" />
      </Section>

      <Section title="Opening">
        <Segmented
          size="sm"
          value={filters.open}
          onChange={(v) => set('open', v)}
          options={[
            { id: 'any', label: 'Any' },
            { id: 'now', label: 'Open now' },
            { id: '24h', label: '24/7' },
          ]}
        />
      </Section>

      <Section title="Brands" badge={filters.brands.length ? <Badge n={filters.brands.length} /> : null}>
        <div className="flex flex-wrap gap-1.5">
          {facets.brands.map(([b, n]) => (
            <Chip key={b} active={filters.brands.includes(b)} color={brandColor(b)} onClick={() => set('brands', toggle(filters.brands, b))}>
              {b} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Cities" defaultOpen={false} badge={filters.cities.length ? <Badge n={filters.cities.length} /> : null}>
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
          {facets.cities.map(([c, n]) => (
            <Chip key={c} active={filters.cities.includes(c)} onClick={() => set('cities', toggle(filters.cities, c))}>
              {c} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Service type" defaultOpen={false} badge={filters.services.length ? <Badge n={filters.services.length} /> : null}>
        <div className="flex flex-wrap gap-1.5">
          {SERVICES.map((s) => (
            <Chip key={s.id} active={filters.services.includes(s.id)} onClick={() => set('services', toggle(filters.services, s.id))}>
              {s.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted">Matches stations offering any selected type.</p>
      </Section>

      <Section title="Payment" defaultOpen={false} badge={filters.payments.length ? <Badge n={filters.payments.length} /> : null}>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENTS.map((p) => (
            <Chip key={p.id} active={filters.payments.includes(p.id)} onClick={() => set('payments', toggle(filters.payments, p.id))}>
              {p.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted">Station must accept all selected methods.</p>
        <Switch checked={filters.clubCard} onChange={(v) => set('clubCard', v)} label="Club / loyalty card" />
        <Switch checked={filters.cooperative} onChange={(v) => set('cooperative', v)} label="Cooperative (members)" />
      </Section>

      <Section title="Favourites" defaultOpen={false}>
        <Switch checked={filters.favoritesOnly} onChange={(v) => set('favoritesOnly', v)} label={`Only favourites (${favoriteCount})`} />
      </Section>

      <Section title="Trip cost calculator">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Fill-up" suffix="L" value={trip.tankLitres} onChange={(v) => setTrip({ ...trip, tankLitres: v })} />
          <NumberField label="Consumption" suffix="L/100km" step={0.1} value={trip.consumption} onChange={(v) => setTrip({ ...trip, consumption: v })} />
        </div>
        <p className="text-xs text-muted">
          “Trip cost” = fill-up price + fuel burnt driving to the station and back. Sort by it to find the truly cheapest option.
        </p>
      </Section>
    </div>
  )
}

function Badge({ n }: { n: number }) {
  return <span className="rounded-full bg-accent px-1.5 text-[10px] text-white normal-case">{n}</span>
}
