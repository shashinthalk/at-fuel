import clsx from 'clsx'
import { ArrowRight, Gauge, Info, PiggyBank, TrendingDown, TrendingUp, Warehouse } from 'lucide-react'
import type { ReactNode } from 'react'
import type { priceStats, TripSettings } from '../lib/filters'
import type { Station } from '../lib/station'

export function StatsBar({
  stats,
  cheapest,
  total,
  shown,
  trip,
  onSelect,
}: {
  stats: ReturnType<typeof priceStats>
  cheapest: Station | undefined
  total: number
  shown: number
  trip: TripSettings
  onSelect: (s: Station) => void
}) {
  if (!stats) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
        <Info className="size-5 shrink-0" />
        {shown} of {total} stations shown. None of them report a price for this fuel type — prices are only published for the cheapest stations in an area.
      </div>
    )
  }
  const saving = (stats.max - stats.min) * trip.tankLitres
  return (
    // Phones: one swipeable row. Wider screens: grid.
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible md:px-0 xl:grid-cols-5">
      <button
        type="button"
        disabled={!cheapest}
        onClick={() => cheapest && onSelect(cheapest)}
        className="group w-[68%] shrink-0 snap-start rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3.5 text-left text-white shadow-md shadow-emerald-600/20 transition-transform active:scale-[0.98] md:w-auto md:p-4 md:hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between text-xs font-medium text-white/85">
          <span className="flex items-center gap-1.5">
            <TrendingDown className="size-4" /> Cheapest
          </span>
          <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums">€ {stats.min.toFixed(3)}</div>
        <div className="truncate text-xs text-white/85" title={cheapest ? `${cheapest.name}, ${cheapest.city}` : ''}>
          {cheapest ? `${cheapest.name}, ${cheapest.city}` : ''}
        </div>
      </button>
      <Tile tone="sky" icon={<Gauge className="size-4" />} label="Average" value={`€ ${stats.avg.toFixed(3)}`} sub={`Median € ${stats.median.toFixed(3)}`} />
      <Tile tone="rose" icon={<TrendingUp className="size-4" />} label="Most expensive" value={`€ ${stats.max.toFixed(3)}`} sub={`Spread ${((stats.max - stats.min) * 100).toFixed(1)} ct / L`} />
      <Tile tone="amber" icon={<PiggyBank className="size-4" />} label={`Savings on ${trip.tankLitres} L`} value={`€ ${saving.toFixed(2)}`} sub="Cheapest vs. most expensive" />
      <Tile tone="violet" icon={<Warehouse className="size-4" />} label="Stations" value={`${shown} / ${total}`} sub={`${stats.count} with a price`} />
    </div>
  )
}

const TONES = {
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
}

function Tile({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub: string; tone: keyof typeof TONES }) {
  return (
    <div className="w-[44%] shrink-0 snap-start rounded-2xl border border-line bg-surface p-3.5 shadow-sm md:w-auto md:p-4">
      <div className="flex items-center gap-2 text-xs font-medium whitespace-nowrap text-muted">
        <span className={clsx('grid size-6 place-items-center rounded-lg', TONES[tone])}>{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="truncate text-xs text-muted" title={sub}>
        {sub}
      </div>
    </div>
  )
}
