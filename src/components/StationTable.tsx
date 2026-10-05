import clsx from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import { FUEL_TYPES, type FuelType } from '../api/econtrol'
import { brandColor } from '../lib/brand'
import { effectiveCost, priceRank, rankColor, type Filters, type SortKey } from '../lib/filters'
import { fmtKm } from '../lib/station'
import { HoverPreview } from './HoverPreview'
import { TileImage } from './LocationImage'
import { CompareButton, type ListProps } from './StationList'

function Th({
  children,
  right,
  sortKey,
  sort,
  sortDir,
  onSort,
  title,
}: {
  children: ReactNode
  right?: boolean
  sortKey?: SortKey
  sort: SortKey
  sortDir: Filters['sortDir']
  onSort: (k: SortKey) => void
  title?: string
}) {
  const active = sortKey && sort === sortKey
  return (
    <th className={clsx('sticky top-0 z-10 bg-sunken px-3 py-2.5 font-medium whitespace-nowrap', right && 'text-right')} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {sortKey ? (
        <button type="button" title={title} onClick={() => onSort(sortKey)} className={clsx('inline-flex items-center gap-1 hover:text-fg', active && 'text-fg')}>
          {children}
          {active ? sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
        </button>
      ) : (
        children
      )}
    </th>
  )
}

export function StationTable({
  sort,
  sortDir,
  onSort,
  onFuel,
  ...p
}: ListProps & { sort: SortKey; sortDir: Filters['sortDir']; onSort: (k: SortKey) => void; onFuel: (f: FuelType) => void }) {
  const th = { sort, sortDir, onSort }
  return (
    <div className="max-h-[calc(100vh-15rem)] overflow-auto rounded-2xl border border-line bg-surface shadow-sm">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <Th {...th}>#</Th>
            <Th {...th} sortKey="name">
              Station
            </Th>
            <Th {...th} sortKey="brand">
              Brand
            </Th>
            {FUEL_TYPES.map((f) =>
              f.id === p.fuel ? (
                <Th key={f.id} {...th} sortKey="price" right>
                  {f.short}
                </Th>
              ) : (
                <th key={f.id} className="sticky top-0 z-10 bg-sunken px-3 py-2.5 text-right font-medium whitespace-nowrap">
                  <button type="button" onClick={() => onFuel(f.id)} title={`Switch to ${f.label}`} className="hover:text-fg">
                    {f.short}
                  </button>
                </th>
              ),
            )}
            {p.showDistance && (
              <Th {...th} sortKey="distance" right>
                Distance
              </Th>
            )}
            {p.showDistance && (
              <Th {...th} sortKey="effective" right title="Fill-up incl. round trip">
                Trip cost
              </Th>
            )}
            <Th {...th}>Status</Th>
            <Th {...th}>
              <span className="sr-only">Compare and favourite</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {p.stations.map((s, i) => {
            const eff = effectiveCost(s.prices[p.fuel], s.distance, p.trip)
            const active = p.selectedId === s.id || p.hoveredId === s.id
            return (
              <tr
                key={s.id}
                onClick={() => p.onSelect(s)}
                onMouseEnter={() => p.onHover(s.id)}
                onMouseLeave={() => p.onHover(null)}
                className={clsx('cursor-pointer border-t border-line transition-colors', active ? 'bg-accent/8' : 'hover:bg-sunken/60')}
              >
                <td className="px-3 py-2 font-mono text-xs text-muted">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <TileImage lat={s.lat} lon={s.lon} width={36} height={36} color={brandColor(s.brand)} className="shrink-0 rounded-lg" lazy compact />
                    <div className="min-w-0 max-w-60">
                      <div className="truncate font-medium" title={s.name}>
                        {s.name}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {s.address}, {s.postalCode} {s.city}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium" style={{ background: `${brandColor(s.brand)}1f`, color: brandColor(s.brand) }}>
                    {s.brand}
                  </span>
                </td>
                {FUEL_TYPES.map((f) => {
                  const v = s.prices[f.id]
                  const isMain = f.id === p.fuel
                  return (
                    <td key={f.id} className="px-3 py-2 text-right">
                      <HoverPreview station={s} fuel={f.id} showDistance={p.showDistance}>
                        <span
                          className={clsx(
                            'inline-block rounded-md px-1.5 py-0.5 font-mono tabular-nums transition-colors hover:bg-sunken',
                            isMain ? 'text-[15px] font-bold' : 'text-muted',
                          )}
                          style={isMain ? { color: rankColor(priceRank(v, p.min, p.max)) } : undefined}
                        >
                          {v?.toFixed(3) ?? '—'}
                        </span>
                      </HoverPreview>
                    </td>
                  )
                })}
                {p.showDistance && <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{fmtKm(s.distance)}</td>}
                {p.showDistance && <td className="px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">{eff !== undefined ? `€ ${eff.toFixed(2)}` : '—'}</td>}
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                      s.openNow === false ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    <span className={clsx('size-1.5 rounded-full', s.openNow === false ? 'bg-rose-500' : 'bg-emerald-500')} />
                    {s.openLabel}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-0.5">
                    <CompareButton active={p.compareIds.includes(s.id)} full={p.compareIds.length >= 4} onClick={() => p.onToggleCompare(s.id)} />
                    <button
                      type="button"
                      aria-label="Toggle favourite"
                      onClick={(e) => {
                        e.stopPropagation()
                        p.onToggleFav(s.id)
                      }}
                      className="rounded-full p-1 text-muted hover:bg-sunken hover:text-amber-500"
                    >
                      <Star className={clsx('size-4', p.favorites.has(s.id) && 'fill-amber-400 text-amber-400')} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
