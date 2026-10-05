import clsx from 'clsx'
import { BarChart3, Building2, ChartScatter, Layers, MapPin, Trophy } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type TooltipContentProps,
} from 'recharts'
import { FUEL_TYPES } from '../api/econtrol'
import { brandColor } from '../lib/brand'
import { priceRank, priceStats, rankColor } from '../lib/filters'
import { fmtKm } from '../lib/station'
import type { ListProps } from './StationList'

const tick = { fill: 'var(--color-muted)', fontSize: 11 }
const axisLine = { stroke: 'var(--color-line)' }
const cursorFill = { fill: 'var(--color-sunken)', fillOpacity: 0.7 }

interface Row {
  id: number
  name: string
  short: string
  city: string
  brand: string
  price: number
  distance: number
}

/** Themed tooltip: always readable in light and dark mode. */
function TooltipCard({ title, subtitle, color, rows }: { title: string; subtitle?: string; color?: string; rows: [string, ReactNode][] }) {
  return (
    <div className="min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg shadow-xl">
      <div className="flex items-center gap-1.5 font-semibold">
        {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
        <span className="truncate">{title}</span>
      </div>
      {subtitle && <div className="mb-1 text-muted">{subtitle}</div>}
      <div className="mt-1 space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <span className="text-muted">{k}</span>
            <span className="font-mono font-medium tabular-nums">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StationTooltip({ active, payload, avg, showDistance }: Partial<TooltipContentProps<number, string>> & { avg: number; showDistance: boolean }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as Row
  const diff = (r.price - avg) * 100
  return (
    <TooltipCard
      title={r.name}
      subtitle={`${r.brand} · ${r.city}`}
      color={brandColor(r.brand)}
      rows={[
        ['Price', `€ ${r.price.toFixed(3)}`],
        ['vs. average', <span className={diff <= 0 ? 'text-emerald-500' : 'text-rose-500'}>{`${diff <= 0 ? '−' : '+'}${Math.abs(diff).toFixed(1)} ct`}</span>],
        ...(showDistance ? ([['Distance', fmtKm(r.distance)]] as [string, ReactNode][]) : []),
      ]}
    />
  )
}

export function Charts(p: ListProps) {
  const [showAll, setShowAll] = useState(false)

  const priced = useMemo<Row[]>(
    () =>
      p.stations
        .filter((s) => s.prices[p.fuel] !== undefined)
        .map((s) => ({
          id: s.id,
          name: s.name,
          short: s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name,
          city: s.city,
          brand: s.brand,
          price: s.prices[p.fuel]!,
          distance: +s.distance.toFixed(2),
        }))
        .sort((a, b) => a.price - b.price),
    [p.stations, p.fuel],
  )

  const byBrand = useMemo(() => {
    const m = new Map<string, number[]>()
    priced.forEach((s) => m.set(s.brand, [...(m.get(s.brand) ?? []), s.price]))
    return [...m.entries()]
      .map(([brand, ps]) => ({ brand, avg: ps.reduce((a, b) => a + b, 0) / ps.length, min: Math.min(...ps), n: ps.length }))
      .sort((a, b) => a.avg - b.avg)
  }, [priced])

  // Histogram in 1-cent buckets.
  const histogram = useMemo(() => {
    if (!priced.length) return []
    const lo = Math.floor(priced[0].price * 100)
    const hi = Math.floor(priced[priced.length - 1].price * 100)
    const bins = Array.from({ length: hi - lo + 1 }, (_, i) => ({ cent: lo + i, label: ((lo + i) / 100).toFixed(2), count: 0 }))
    priced.forEach((r) => bins[Math.floor(r.price * 100) - lo].count++)
    return bins
  }, [priced])

  const fuelCompare = useMemo(
    () =>
      FUEL_TYPES.map((f) => {
        const st = priceStats(p.stations, f.id)
        return { fuel: f.short, min: st?.min ?? 0, avg: st?.avg ?? 0, max: st?.max ?? 0, count: st?.count ?? 0 }
      }).filter((x) => x.count),
    [p.stations],
  )

  if (!priced.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">
        <BarChart3 className="size-8 opacity-50" />
        No stations with a reported price to chart.
      </div>
    )
  }

  const avg = priced.reduce((a, b) => a + b.price, 0) / priced.length
  const domain: [number, number] = [Math.floor((p.min - 0.01) * 100) / 100, Math.ceil((p.max + 0.005) * 100) / 100]
  const ranking = showAll ? priced : priced.slice(0, 15)
  const select = (id: number) => {
    const s = p.stations.find((x) => x.id === id)
    if (s) p.onSelect(s)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        icon={<Trophy className="size-4" />}
        title="Price ranking"
        sub="Cheapest first · dashed line marks the average · click a bar for details"
        className="lg:col-span-2"
        action={
          priced.length > 15 && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-sunken">
              {showAll ? 'Top 15' : `Show all ${priced.length}`}
            </button>
          )
        }
      >
        <ResponsiveContainer width="100%" height={ranking.length * 30 + 56}>
          <BarChart data={ranking} layout="vertical" margin={{ left: 4, right: 56, top: 18, bottom: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis type="number" domain={domain} tickFormatter={(v: number) => v.toFixed(2)} tick={tick} axisLine={axisLine} tickLine={false} />
            <YAxis type="category" dataKey="short" width={170} tick={<NameTick />} axisLine={false} tickLine={false} interval={0} />
            <Tooltip cursor={cursorFill} content={<StationTooltip avg={avg} showDistance={p.showDistance} />} />
            <ReferenceLine x={avg} stroke="var(--color-accent)" strokeDasharray="5 4" label={{ value: 'avg', position: 'top', fill: 'var(--color-accent)', fontSize: 10 }} />
            <Bar dataKey="price" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d) => select((d as unknown as { payload: Row }).payload.id)}>
              {ranking.map((d) => (
                <Cell key={d.id} fill={rankColor(priceRank(d.price, p.min, p.max))} />
              ))}
              <LabelList dataKey="price" position="right" formatter={(v) => Number(v).toFixed(3)} style={{ fill: 'var(--color-fg)', fontSize: 11, fontFamily: 'var(--font-mono)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card icon={<Layers className="size-4" />} title="Price distribution" sub="Number of stations per 1-cent price band">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={histogram} margin={{ right: 8, top: 16 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={tick} axisLine={axisLine} tickLine={false} />
            <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              cursor={cursorFill}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={`€ ${payload[0].payload.label} – ${(payload[0].payload.cent / 100 + 0.009).toFixed(3)}`}
                    rows={[['Stations', payload[0].payload.count]]}
                  />
                ) : null
              }
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {histogram.map((b) => (
                <Cell key={b.cent} fill={rankColor(priceRank(b.cent / 100 + 0.005, p.min, p.max))} />
              ))}
              <LabelList dataKey="count" position="top" style={{ fill: 'var(--color-muted)', fontSize: 10 }} formatter={(v) => (Number(v) ? v : '')} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {p.showDistance ? (
        <Card icon={<ChartScatter className="size-4" />} title="Price vs. distance" sub="Bottom-left is cheap and close · colour = brand">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ right: 12, top: 8 }}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="distance" name="Distance" unit=" km" tick={tick} axisLine={axisLine} tickLine={false} />
              <YAxis type="number" dataKey="price" name="Price" domain={domain} tickFormatter={(v: number) => v.toFixed(2)} tick={tick} axisLine={false} tickLine={false} width={40} />
              <ZAxis range={[90, 90]} />
              <ReferenceLine y={avg} stroke="var(--color-accent)" strokeDasharray="5 4" />
              <Tooltip cursor={{ stroke: 'var(--color-muted)', strokeDasharray: '3 3' }} content={<StationTooltip avg={avg} showDistance />} />
              <Scatter data={priced} cursor="pointer" onClick={(d) => select((d as unknown as { payload: Row }).payload.id)}>
                {priced.map((d) => (
                  <Cell key={d.id} fill={brandColor(d.brand)} stroke="var(--color-surface)" strokeWidth={1.5} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      ) : (
        <Card icon={<MapPin className="size-4" />} title="Cheapest cities" sub="Lowest reported price per city">
          <CityList rows={priced} />
        </Card>
      )}

      <Card icon={<Building2 className="size-4" />} title="Average by brand" sub="Bar = average · label = station count">
        <ResponsiveContainer width="100%" height={Math.max(200, byBrand.length * 32 + 30)}>
          <BarChart data={byBrand} layout="vertical" margin={{ right: 56, left: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis type="number" domain={domain} tickFormatter={(v: number) => v.toFixed(2)} tick={tick} axisLine={axisLine} tickLine={false} />
            <YAxis type="category" dataKey="brand" width={96} tick={tick} axisLine={false} tickLine={false} interval={0} />
            <Tooltip
              cursor={cursorFill}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const b = payload[0].payload as (typeof byBrand)[number]
                return (
                  <TooltipCard
                    title={b.brand}
                    color={brandColor(b.brand)}
                    rows={[
                      ['Average', `€ ${b.avg.toFixed(3)}`],
                      ['Cheapest', `€ ${b.min.toFixed(3)}`],
                      ['Stations', b.n],
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="avg" radius={[0, 6, 6, 0]}>
              {byBrand.map((d) => (
                <Cell key={d.brand} fill={brandColor(d.brand)} />
              ))}
              <LabelList dataKey="avg" position="right" formatter={(v) => Number(v).toFixed(3)} style={{ fill: 'var(--color-fg)', fontSize: 11, fontFamily: 'var(--font-mono)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {fuelCompare.length > 1 && (
        <Card icon={<BarChart3 className="size-4" />} title="Fuel types compared" sub="Min / average / max of the current results">
          <div className="space-y-4 pt-1">
            {fuelCompare.map((f) => {
              const lo = Math.min(...fuelCompare.map((x) => x.min)) - 0.05
              const hi = Math.max(...fuelCompare.map((x) => x.max)) + 0.05
              const pct = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
              return (
                <div key={f.fuel}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{f.fuel}</span>
                    <span className="text-xs text-muted">{f.count} prices</span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-sunken">
                    <div
                      className="absolute h-full rounded-full"
                      style={{ left: pct(f.min), width: `calc(${pct(f.max)} - ${pct(f.min)})`, background: `linear-gradient(90deg, ${rankColor(0)}, ${rankColor(1)})` }}
                    />
                    <div className="absolute -top-1 h-4.5 w-1 -translate-x-1/2 rounded bg-fg" style={{ left: pct(f.avg) }} title="Average" />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-muted">
                    <span>{f.min.toFixed(3)}</span>
                    <span className="text-fg">ø {f.avg.toFixed(3)}</span>
                    <span>{f.max.toFixed(3)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

/** Single-line axis label (Recharts' default tick wraps long names). */
function NameTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="var(--color-muted)" fontSize={11}>
      {payload?.value}
    </text>
  )
}

function CityList({ rows }: { rows: Row[] }) {
  const cities = useMemo(() => {
    const m = new Map<string, Row>()
    rows.forEach((r) => (!m.has(r.city) || m.get(r.city)!.price > r.price) && m.set(r.city, r))
    return [...m.values()].sort((a, b) => a.price - b.price).slice(0, 8)
  }, [rows])
  return (
    <ol className="space-y-1.5">
      {cities.map((c, i) => (
        <li key={c.city} className="flex items-center gap-2 text-sm">
          <span className="w-5 text-right font-mono text-xs text-muted">{i + 1}</span>
          <span className="flex-1 truncate">{c.city}</span>
          <span className="font-mono tabular-nums">{c.price.toFixed(3)}</span>
        </li>
      ))}
    </ol>
  )
}

function Card({ icon, title, sub, children, className, action }: { icon: ReactNode; title: string; sub: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={clsx('rounded-2xl border border-line bg-surface p-4 shadow-sm', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">{icon}</span>
          <div>
            <h3 className="leading-tight font-semibold">{title}</h3>
            <p className="text-xs text-muted">{sub}</p>
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
