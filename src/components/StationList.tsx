import clsx from 'clsx'
import { Award, Clock, MapPin, Navigation, Scale, Star, TrendingDown, TrendingUp } from 'lucide-react'
import { FUEL_TYPES, type FuelType } from '../api/econtrol'
import { brandColor } from '../lib/brand'
import { effectiveCost, priceRank, rankColor, type TripSettings } from '../lib/filters'
import { fmtKm, type Station } from '../lib/station'
import { HoverPreview } from './HoverPreview'
import { TileImage } from './LocationImage'

export interface ListProps {
  stations: Station[]
  fuel: FuelType
  min: number
  max: number
  avg: number | undefined
  trip: TripSettings
  favorites: Set<number>
  onToggleFav: (id: number) => void
  compareIds: number[]
  onToggleCompare: (id: number) => void
  onSelect: (s: Station) => void
  selectedId: number | null
  hoveredId: number | null
  onHover: (id: number | null) => void
  showDistance: boolean
  compact?: boolean
}

const MEDALS = ['#f5b301', '#a8b3c2', '#cd7f32']

export function StationList(p: ListProps) {
  // Medals go to the three cheapest prices in the current result set.
  const podium = [...new Set(p.stations.map((s) => s.prices[p.fuel]).filter((x): x is number => x !== undefined))].sort((a, b) => a - b).slice(0, 3)

  return (
    <div className={clsx('grid gap-3', p.compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3')}>
      {p.stations.map((s) => {
        const price = s.prices[p.fuel]
        const rank = priceRank(price, p.min, p.max)
        const eff = effectiveCost(price, s.distance, p.trip)
        const fav = p.favorites.has(s.id)
        const medal = price !== undefined ? podium.indexOf(price) : -1
        const diff = price !== undefined && p.avg !== undefined ? (price - p.avg) * 100 : undefined
        const active = p.selectedId === s.id || p.hoveredId === s.id
        return (
          <article
            key={s.id}
            onClick={() => p.onSelect(s)}
            onMouseEnter={() => p.onHover(s.id)}
            onMouseLeave={() => p.onHover(null)}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && p.onSelect(s)}
            className={clsx(
              'group relative flex cursor-pointer gap-3 rounded-2xl border bg-surface p-3 shadow-sm transition-all outline-none select-none',
              'active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-accent lg:hover:-translate-y-0.5 lg:hover:shadow-lg',
              active ? 'border-accent/60 ring-2 ring-accent/20' : 'border-line',
            )}
          >
            <div className="relative shrink-0 self-start">
              <TileImage lat={s.lat} lon={s.lon} width={64} height={64} zoom={18} color={brandColor(s.brand)} className="rounded-xl sm:hidden" lazy compact />
              <TileImage lat={s.lat} lon={s.lon} width={76} height={76} zoom={18} color={brandColor(s.brand)} className="hidden rounded-xl sm:block" lazy compact />
              {medal >= 0 && (
                <span
                  className="absolute -top-1.5 -left-1.5 grid size-6 place-items-center rounded-full text-white shadow ring-2 ring-surface"
                  style={{ background: MEDALS[medal] }}
                  title={`#${medal + 1} cheapest`}
                >
                  <Award className="size-3.5" />
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase" style={{ color: brandColor(s.brand) }}>
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: brandColor(s.brand) }} />
                    <span className="truncate">{s.brand}</span>
                  </div>
                  <h3 className="line-clamp-2 leading-snug font-semibold break-words" title={s.name}>
                    {s.name}
                  </h3>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">
                      {s.address}, {s.city}
                    </span>
                  </p>
                </div>

                <HoverPreview station={s} fuel={p.fuel} showDistance={p.showDistance} className="shrink-0">
                  <div className="rounded-xl py-0.5 pl-1 text-right transition-colors sm:px-2 sm:py-1 sm:group-hover:bg-sunken">
                    <div className="font-mono text-xl leading-tight font-bold tabular-nums" style={{ color: rankColor(rank) }}>
                      {price !== undefined ? price.toFixed(3) : '—'}
                    </div>
                    <div className="text-[10px] text-muted">{price !== undefined ? 'EUR / litre' : 'not reported'}</div>
                  </div>
                </HoverPreview>
              </div>

              <div className="mt-auto flex items-end gap-2 pt-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[11px]">
                  {p.showDistance && (
                    <Pill>
                      <Navigation className="size-3" />
                      {fmtKm(s.distance)}
                    </Pill>
                  )}
                  <Pill className={s.openNow === false ? 'text-rose-500' : s.openNow ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                    <Clock className="size-3" />
                    {s.openLabel}
                  </Pill>
                  {diff !== undefined && Math.abs(diff) >= 0.05 && (
                    <Pill className={clsx('hidden sm:inline-flex', diff < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')} title="Compared with the average of the results">
                      {diff < 0 ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
                      {Math.abs(diff).toFixed(1)} ct
                    </Pill>
                  )}
                  {p.showDistance && eff !== undefined && <Pill title={`${p.trip.tankLitres} L fill-up incl. round trip`}>Trip € {eff.toFixed(2)}</Pill>}
                  {!p.compact &&
                    FUEL_TYPES.filter((f) => f.id !== p.fuel && s.prices[f.id] !== undefined).map((f) => (
                      <Pill key={f.id} className="hidden sm:inline-flex">
                        {f.short} {s.prices[f.id]!.toFixed(3)}
                      </Pill>
                    ))}
                </div>
                <div className="-mr-1 -mb-1 flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
                    title={fav ? 'Remove from favourites' : 'Add to favourites'}
                    onClick={(e) => {
                      e.stopPropagation()
                      p.onToggleFav(s.id)
                    }}
                    className="grid size-8 place-items-center rounded-full text-muted transition-all hover:bg-sunken hover:text-amber-500 active:scale-90"
                  >
                    <Star className={clsx('size-4', fav && 'fill-amber-400 text-amber-400')} />
                  </button>
                  <CompareButton active={p.compareIds.includes(s.id)} full={p.compareIds.length >= 4} onClick={() => p.onToggleCompare(s.id)} />
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function CompareButton({ active, full, onClick }: { active: boolean; full: boolean; onClick: () => void }) {
  const label = active ? 'Remove from comparison' : full ? 'Comparison is full (4 stations)' : 'Add to comparison'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={!active && full}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={clsx(
        'grid size-8 place-items-center rounded-full transition-all active:scale-90 disabled:opacity-30',
        active ? 'bg-accent text-white' : 'text-muted hover:bg-sunken hover:text-accent',
      )}
    >
      <Scale className="size-4" />
    </button>
  )
}

function Pill({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 rounded-md bg-sunken px-1.5 py-0.5 font-medium', className)}>
      {children}
    </span>
  )
}
