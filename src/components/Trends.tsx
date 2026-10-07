import clsx from 'clsx'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Clock3,
  Database,
  GitCompareArrows,
  Globe2,
  History,
  Info,
  LineChart as LineIcon,
  Minus,
  Terminal,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { FUEL_TYPES, type FuelType } from '../api/econtrol'
import { useHistoryData, useNationalHistory } from '../hooks/useHistoryData'
import { PriceRecords } from './PriceRecords'
import { WeeklyAnalysis } from './WeeklyAnalysis'
import { brandColor } from '../lib/brand'
import {
  aggregate,
  changeOver,
  changesIn,
  lastPriceAt,
  seriesKey,
  sliceSeries,
  timePattern,
  type Change,
  type NationalFile,
  type Point,
} from '../lib/historyData'
import type { Station } from '../lib/station'
import type { ListProps } from './StationList'

const HOUR = 3600_000
const DAY = 24 * HOUR

type Range = '24h' | '7d' | '30d' | '90d' | 'all'
const RANGES: { id: Range; label: string; ms: number | null }[] = [
  { id: '24h', label: '24 h', ms: DAY },
  { id: '7d', label: '7 days', ms: 7 * DAY },
  { id: '30d', label: '30 days', ms: 30 * DAY },
  { id: '90d', label: '90 days', ms: 90 * DAY },
  { id: 'all', label: 'All', ms: null },
]

const LINE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16', '#ec4899']
const tick = { fill: 'var(--color-muted)', fontSize: 11 }
const axisLine = { stroke: 'var(--color-line)' }

// ---------------------------------------------------------------------------
// Formatting helpers

function fmtCt(diff: number | undefined, digits = 1) {
  if (diff === undefined) return '—'
  const ct = diff * 100
  if (Math.abs(ct) < 0.05) return '±0.0 ct'
  return `${ct > 0 ? '+' : '−'}${Math.abs(ct).toFixed(digits)} ct`
}

function fmtTime(t: number, spanMs: number) {
  const d = new Date(t)
  if (spanMs <= 2 * DAY) return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
  if (spanMs <= 120 * DAY) return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
  return d.toLocaleDateString('de-AT', { month: 'short', year: '2-digit' })
}

const fmtDateTime = (t: number) => new Date(t).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })

function ago(t: number, now: number) {
  const min = Math.round((now - t) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function Trend({ change, size = 'sm' }: { change: Change | number | undefined; size?: 'sm' | 'md' }) {
  const diff = typeof change === 'number' ? change : change?.diff
  if (diff === undefined) return <span className="text-muted">—</span>
  const ct = diff * 100
  const flat = Math.abs(ct) < 0.05
  const Icon = flat ? Minus : ct > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 font-mono font-semibold whitespace-nowrap tabular-nums',
        size === 'md' ? 'text-sm' : 'text-xs',
        flat ? 'text-muted' : ct > 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400',
      )}
    >
      <Icon className={size === 'md' ? 'size-4' : 'size-3.5'} />
      {fmtCt(diff)}
    </span>
  )
}

function TooltipBox({ title, rows }: { title: string; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-48 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg shadow-xl">
      <div className="mb-1 font-semibold">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex min-w-0 items-center gap-1.5 text-muted">
            {r.color && <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />}
            <span className="truncate">{r.label}</span>
          </span>
          <span className="font-mono font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function Card({ icon, title, sub, action, children, className }: { icon: ReactNode; title: string; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-2xl border border-line bg-surface p-4 shadow-sm', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">{icon}</span>
          <div>
            <h3 className="leading-tight font-semibold">{title}</h3>
            {sub && <p className="text-xs text-muted">{sub}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function Pills<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={clsx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-35',
            value === o.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-sunken text-muted">{icon}</span>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}

/** Tiny step-line sparkline. */
function Sparkline({ pts, start, end, width = 96, height = 26 }: { pts: Point[]; start: number; end: number; width?: number; height?: number }) {
  const vals = pts.filter((p) => p.p !== null) as { t: number; p: number }[]
  if (vals.length < 1) return <span className="text-xs text-muted">—</span>
  const lo = Math.min(...vals.map((v) => v.p))
  const hi = Math.max(...vals.map((v) => v.p))
  const x = (t: number) => ((t - start) / Math.max(1, end - start)) * (width - 2) + 1
  const y = (p: number) => (hi === lo ? height / 2 : height - 3 - ((p - lo) / (hi - lo)) * (height - 6))
  let d = `M${x(vals[0].t)},${y(vals[0].p)}`
  for (let i = 1; i < vals.length; i++) d += ` H${x(vals[i].t)} V${y(vals[i].p)}`
  d += ` H${x(end)}`
  const last = vals[vals.length - 1].p
  const color = last > vals[0].p ? '#f43f5e' : last < vals[0].p ? '#10b981' : 'var(--color-muted)'
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(end)} cy={y(last)} r={2.2} fill={color} />
    </svg>
  )
}

// ---------------------------------------------------------------------------

export function Trends(p: ListProps & { localStamp: number }) {
  const now = useNow()
  const { data: history } = useHistoryData(p.localStamp)
  const [range, setRange] = useState<Range>('7d')

  const recorded = history.firstAt !== null ? now - history.firstAt : 0
  const isEnabled = (r: (typeof RANGES)[number]) => r.ms === null || r.ms <= DAY || recorded >= r.ms / 7
  // Fall back to the longest period that has data when the chosen one is not available yet.
  const effective = isEnabled(RANGES.find((r) => r.id === range)!) ? range : '24h'
  const span = RANGES.find((r) => r.id === effective)!.ms
  // Never start before recording began, so charts are not mostly empty.
  const start = Math.max(span ? now - span : 0, history.firstAt ?? now - DAY)

  const pricedStations = useMemo(() => p.stations.filter((s) => history.series.has(seriesKey(s.id, p.fuel))), [p.stations, history, p.fuel])

  return (
    <div className="space-y-4">
      <DataStatus history={history} now={now} />

      <PriceRecords fuel={p.fuel} now={now} />

      <WeeklyAnalysis stations={pricedStations} fuel={p.fuel} series={history.series} now={now} onSelect={p.onSelect} />

      <NationalTrend fuel={p.fuel} areaAvg={p.avg} />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Recorded station history</h3>
          <p className="text-xs text-muted">
            {pricedStations.length} of {p.stations.length} stations in your current results have recorded {FUEL_TYPES.find((f) => f.id === p.fuel)!.label} prices
          </p>
        </div>
        <Pills
          value={effective}
          onChange={setRange}
          options={RANGES.map((r) => ({ id: r.id, label: r.label, disabled: !isEnabled(r) }))}
        />
      </div>

      <AreaTrend stations={pricedStations} fuel={p.fuel} series={history.series} start={start} end={now} />
      <StationChanges {...p} stations={pricedStations} series={history.series} start={start} end={now} rangeLabel={RANGES.find((r) => r.id === effective)!.label} />
      <TimePatterns stations={pricedStations} fuel={p.fuel} series={history.series} start={span ? Math.max(start, now - 90 * DAY) : start} end={now} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data status

function DataStatus({ history, now }: { history: ReturnType<typeof useHistoryData>['data']; now: number }) {
  const runs = history.runs.length
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-500">
        <Database className="size-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {history.hasCollector ? (
          <>
            <p className="font-medium">
              {runs} snapshot{runs === 1 ? '' : 's'} recorded
              {history.firstAt && <span className="font-normal text-muted"> since {fmtDateTime(history.firstAt)}</span>}
            </p>
            <p className="text-xs text-muted">
              Last snapshot {history.updatedAt ? ago(history.updatedAt, now) : '—'} · {Object.keys(history.stations).length} stations tracked · history fills in as the collector keeps running
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">Only prices seen in this browser are recorded</p>
            <p className="text-xs text-muted">Start the collector to record every station's prices around the clock — even when the app is closed.</p>
          </>
        )}
      </div>
      <code className="flex shrink-0 items-center gap-2 rounded-lg bg-sunken px-3 py-2 font-mono text-xs">
        <Terminal className="size-3.5 text-muted" />
        npm run collect -- --watch 30
      </code>
    </div>
  )
}

// ---------------------------------------------------------------------------
// National trend (EU Weekly Oil Bulletin)

type NatRange = '4w' | '3m' | '6m' | '1y' | '3y' | '5y' | 'all'
const NAT_RANGES: { id: NatRange; label: string; weeks: number | null }[] = [
  { id: '4w', label: '4W', weeks: 5 },
  { id: '3m', label: '3M', weeks: 13 },
  { id: '6m', label: '6M', weeks: 26 },
  { id: '1y', label: '1Y', weeks: 52 },
  { id: '3y', label: '3Y', weeks: 156 },
  { id: '5y', label: '5Y', weeks: 260 },
  { id: 'all', label: 'Since 2005', weeks: null },
]

function NationalTrend({ fuel, areaAvg }: { fuel: FuelType; areaAvg: number | undefined }) {
  const national = useNationalHistory()
  const [range, setRange] = useState<NatRange>('1y')
  const [showEu, setShowEu] = useState(true)
  const effFuel: 'SUP' | 'DIE' = fuel === 'DIE' ? 'DIE' : 'SUP'
  const at = effFuel === 'SUP' ? 'at95' : 'atDie'
  const eu = effFuel === 'SUP' ? 'eu95' : 'euDie'

  const weeks = national.data?.weeks ?? []
  const valid = useMemo(() => weeks.filter((w) => w[at] !== null), [weeks, at])
  const n = NAT_RANGES.find((r) => r.id === range)!.weeks
  const shown = n ? valid.slice(-n) : valid
  const latest = valid[valid.length - 1]

  const changeVs = (weeksBack: number) => {
    const past = valid[valid.length - 1 - weeksBack]
    return latest && past ? (latest[at]! - past[at]!) : undefined
  }

  const yearly = useMemo(() => {
    const m = new Map<number, number[]>()
    valid.forEach((w) => {
      const y = Number(w.d.slice(0, 4))
      m.set(y, [...(m.get(y) ?? []), w[at]!])
    })
    const rows = [...m.entries()].map(([year, v]) => ({ year, avg: v.reduce((a, b) => a + b, 0) / v.length }))
    return rows.map((r, i) => ({ ...r, yoy: i ? r.avg - rows[i - 1].avg : undefined }))
  }, [valid, at])

  if (national.isLoading) return <div className="h-80 animate-pulse rounded-2xl bg-sunken" />
  if (!national.data) {
    return (
      <Card icon={<Globe2 className="size-4" />} title="Austria — national average">
        <Empty icon={<Globe2 className="size-5" />} title="National history not imported yet">
          Run <code className="rounded bg-sunken px-1 font-mono text-xs">npm run history:national</code> to download official weekly prices since 2005.
        </Empty>
      </Card>
    )
  }

  const periodChange = shown.length > 1 ? shown[shown.length - 1][at]! - shown[0][at]! : undefined
  const periodVals = shown.map((w) => w[at]!)
  const spanMs = shown.length > 1 ? new Date(shown[shown.length - 1].d).getTime() - new Date(shown[0].d).getTime() : DAY

  return (
    <Card
      icon={<Globe2 className="size-4" />}
      title={`Austria — national average, ${effFuel === 'SUP' ? 'Super 95' : 'Diesel'}`}
      sub={
        <>
          Official weekly averages across all Austrian stations · EU Weekly Oil Bulletin
          {fuel === 'GAS' && ' · CNG is not covered, showing Super 95'}
        </>
      }
      action={<Pills value={range} onChange={setRange} options={NAT_RANGES.map((r) => ({ id: r.id, label: r.label }))} />}
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={`Week of ${latest ? new Date(latest.d).toLocaleDateString('de-AT') : ''}`} value={latest ? `€ ${latest[at]!.toFixed(3)}` : '—'} />
        <Kpi label="vs. last week" value={<Trend change={changeVs(1)} size="md" />} />
        <Kpi label="vs. 1 month" value={<Trend change={changeVs(4)} size="md" />} />
        <Kpi label="vs. 1 year" value={<Trend change={changeVs(52)} size="md" />} />
        <Kpi label="Period low / high" value={periodVals.length ? <span className="font-mono text-sm font-semibold">{Math.min(...periodVals).toFixed(3)} / {Math.max(...periodVals).toFixed(3)}</span> : '—'} />
        <Kpi label="Change in period" value={<Trend change={periodChange} size="md" />} />
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={shown} margin={{ right: 12, top: 8 }}>
          <defs>
            <linearGradient id="natFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
          <XAxis dataKey="d" tick={tick} axisLine={axisLine} tickLine={false} minTickGap={40} tickFormatter={(d: string) => fmtTime(new Date(d).getTime(), spanMs)} />
          <YAxis domain={['dataMin - 0.03', 'dataMax + 0.03']} tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            cursor={{ stroke: 'var(--color-muted)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const w = payload[0].payload as NationalFile['weeks'][number]
              const idx = valid.findIndex((x) => x.d === w.d)
              const prev = idx > 0 ? valid[idx - 1] : undefined
              return (
                <TooltipBox
                  title={`Week of ${new Date(w.d).toLocaleDateString('de-AT', { dateStyle: 'medium' })}`}
                  rows={[
                    { label: 'Austria', value: `€ ${w[at]?.toFixed(3)}`, color: 'var(--color-accent)' },
                    ...(showEu && w[eu] ? [{ label: 'EU average', value: `€ ${w[eu]!.toFixed(3)}`, color: '#94a3b8' }] : []),
                    ...(prev ? [{ label: 'vs. previous week', value: <Trend change={w[at]! - prev[at]!} /> }] : []),
                  ]}
                />
              )
            }}
          />
          <Area type="monotone" dataKey={at} stroke="none" fill="url(#natFill)" isAnimationActive={false} />
          <Line type="monotone" dataKey={at} name="Austria" stroke="var(--color-accent)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
          {showEu && <Line type="monotone" dataKey={eu} name="EU average" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
          {areaAvg !== undefined && fuel !== 'GAS' && (
            <ReferenceLine y={areaAvg} stroke="#10b981" strokeDasharray="4 4" label={{ value: `Your area today ${areaAvg.toFixed(3)}`, position: 'insideBottomRight', fill: '#10b981', fontSize: 10 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showEu} onChange={(e) => setShowEu(e.target.checked)} className="accent-[var(--color-accent)]" />
          Compare with EU average
        </label>
        <a href={national.data.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-fg hover:underline">
          Source: {national.data.source}
        </a>
      </div>

      <WeekByWeek weeks={weeks} />

      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-muted" /> Year by year
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={yearly} margin={{ right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={tick} axisLine={axisLine} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis domain={['dataMin - 0.1', 'dataMax + 0.05']} tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => v.toFixed(2)} />
            <Tooltip
              cursor={{ fill: 'var(--color-sunken)', fillOpacity: 0.7 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as (typeof yearly)[number]
                return <TooltipBox title={String(r.year)} rows={[{ label: 'Average', value: `€ ${r.avg.toFixed(3)}` }, { label: 'vs. previous year', value: <Trend change={r.yoy} /> }]} />
              }}
            />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {yearly.map((r) => (
                <Cell key={r.year} fill={r.yoy === undefined ? '#94a3b8' : r.yoy > 0 ? '#f43f5e' : '#10b981'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-muted">Bar colour: red = more expensive than the year before, green = cheaper.</p>
      </div>
    </Card>
  )
}

/** Last few bulletin weeks for both fuels, with week-over-week change. */
function WeekByWeek({ weeks }: { weeks: NationalFile['weeks'] }) {
  const rows = weeks.slice(-5)
  if (rows.length < 2) return null
  const shown = rows.slice(1).reverse()
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <CalendarClock className="size-4 text-muted" /> Last 4 weeks, week by week
        <span className="text-xs font-normal text-muted">· national data is published once a week (Monday reference date)</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-sunken text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Week of</th>
              <th className="px-3 py-2 text-right font-medium">Super 95</th>
              <th className="px-3 py-2 text-right font-medium">vs. prev. week</th>
              <th className="px-3 py-2 text-right font-medium">Diesel</th>
              <th className="px-3 py-2 text-right font-medium">vs. prev. week</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((w) => {
              const prev = rows[rows.indexOf(w) - 1]
              return (
                <tr key={w.d} className="border-t border-line">
                  <td className="px-3 py-2">{new Date(w.d).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{w.at95?.toFixed(3) ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Trend change={w.at95 !== null && prev?.at95 != null ? w.at95 - prev.at95 : undefined} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{w.atDie?.toFixed(3) ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Trend change={w.atDie !== null && prev?.atDie != null ? w.atDie - prev.atDie : undefined} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-sunken px-3 py-2">
      <div className="truncate text-[11px] text-muted">{label}</div>
      <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Area trend (min / avg / max of the stations in the current results)

function AreaTrend({ stations, fuel, series, start, end }: { stations: Station[]; fuel: FuelType; series: Map<string, Point[]>; start: number; end: number }) {
  const span = end - start
  const step = span <= 2 * DAY ? HOUR / 2 : span <= 8 * DAY ? HOUR : span <= 35 * DAY ? 3 * HOUR : 12 * HOUR
  const data = useMemo(() => {
    const list = stations.map((s) => series.get(seriesKey(s.id, fuel))!)
    return aggregate(list, Math.ceil(start / step) * step, end, step)
      .concat(aggregate(list, end, end, 1))
      .map((r) => ({ ...r, range: [r.min, r.max] as [number, number] }))
  }, [stations, series, fuel, start, end, step])

  const first = data[0]
  const last = data[data.length - 1]
  const distinctTimes = new Set(data.map((d) => `${d.min}-${d.avg}-${d.max}`)).size

  return (
    <Card
      icon={<LineIcon className="size-4" />}
      title="Price trend in this area"
      sub="Cheapest, average and most expensive reported price among the stations in your current results"
    >
      {data.length < 2 || distinctTimes < 1 ? (
        <Empty icon={<History className="size-5" />} title="Not enough history for this period yet">
          The trend appears once a few snapshots have been recorded. Keep the collector running or reload the app later.
        </Empty>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Average now" value={`€ ${last.avg.toFixed(3)}`} />
            <Kpi label="Average change" value={<Trend change={last.avg - first.avg} size="md" />} />
            <Kpi label="Cheapest change" value={<Trend change={last.min - first.min} size="md" />} />
            <Kpi label="Priciest change" value={<Trend change={last.max - first.max} size="md" />} />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ right: 12, top: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" scale="time" domain={[data[0].t, end]} tick={tick} axisLine={axisLine} tickLine={false} minTickGap={40} tickFormatter={(t: number) => fmtTime(t, span)} />
              <YAxis domain={['dataMin - 0.01', 'dataMax + 0.01']} tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toFixed(2)} />
              <Tooltip
                cursor={{ stroke: 'var(--color-muted)', strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const r = payload[0].payload as (typeof data)[number]
                  return (
                    <TooltipBox
                      title={fmtDateTime(r.t)}
                      rows={[
                        { label: 'Most expensive', value: `€ ${r.max.toFixed(3)}`, color: '#f43f5e' },
                        { label: 'Average', value: `€ ${r.avg.toFixed(3)}`, color: 'var(--color-accent)' },
                        { label: 'Cheapest', value: `€ ${r.min.toFixed(3)}`, color: '#10b981' },
                        { label: 'Stations', value: r.n },
                      ]}
                    />
                  )
                }}
              />
              <Area type="stepAfter" dataKey="range" stroke="none" fill="var(--color-accent)" fillOpacity={0.12} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="max" stroke="#f43f5e" strokeWidth={1.4} dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="avg" stroke="var(--color-accent)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="min" stroke="#10b981" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Per-station changes + comparison chart

type ChangeSort = 'name' | 'price' | 'd24' | 'd7' | 'd30' | 'dRange' | 'moves'

function StationChanges(
  p: ListProps & { stations: Station[]; series: Map<string, Point[]>; start: number; end: number; rangeLabel: string },
) {
  const [sort, setSort] = useState<{ key: ChangeSort; dir: 1 | -1 }>({ key: 'dRange', dir: 1 })
  const [picked, setPicked] = useState<number[] | null>(null)

  const rows = useMemo(
    () =>
      p.stations.map((s) => {
        const pts = p.series.get(seriesKey(s.id, p.fuel))
        const price = s.prices[p.fuel] ?? lastPriceAt(pts, p.end)
        // Price at the start of the period, or the first price recorded within it.
        const rangeFrom = lastPriceAt(pts, p.start) ?? pts?.find((x) => x.t >= p.start && x.p !== null)?.p ?? undefined
        const moves = changesIn(pts, p.start, p.end)
        return {
          s,
          pts: sliceSeries(pts, p.start, p.end),
          price,
          d24: changeOver(pts, p.end, DAY),
          d7: changeOver(pts, p.end, 7 * DAY),
          d30: changeOver(pts, p.end, 30 * DAY),
          dRange: price !== undefined && rangeFrom !== undefined ? price - rangeFrom : undefined,
          moves,
        }
      }),
    [p.stations, p.series, p.fuel, p.start, p.end],
  )

  const sorted = useMemo(() => {
    const val = (r: (typeof rows)[number]): number | string | undefined => {
      switch (sort.key) {
        case 'name':
          return r.s.name
        case 'price':
          return r.price
        case 'd24':
          return r.d24?.diff
        case 'd7':
          return r.d7?.diff
        case 'd30':
          return r.d30?.diff
        case 'dRange':
          return r.dRange
        case 'moves':
          return r.moves.up + r.moves.down
      }
    }
    return [...rows].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      if (va === undefined) return 1
      if (vb === undefined) return -1
      return (typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)) * sort.dir
    })
  }, [rows, sort])

  const withChange = rows.filter((r) => r.dRange !== undefined)
  const biggestDrop = withChange.reduce<(typeof rows)[number] | undefined>((m, r) => (r.dRange! < (m?.dRange ?? 0) ? r : m), undefined)
  const biggestRise = withChange.reduce<(typeof rows)[number] | undefined>((m, r) => (r.dRange! > (m?.dRange ?? 0) ? r : m), undefined)
  const ups = withChange.filter((r) => r.dRange! > 0.0004).length
  const downs = withChange.filter((r) => r.dRange! < -0.0004).length

  // Default comparison: the five cheapest stations right now.
  const compareIds = picked ?? [...rows].filter((r) => r.price !== undefined).sort((a, b) => a.price! - b.price!).slice(0, 5).map((r) => r.s.id)
  const toggle = (id: number) => {
    const cur = compareIds
    setPicked(cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 8 ? cur : [...cur, id])
  }

  const head = (key: ChangeSort, label: string, right = true) => (
    <th className={clsx('sticky top-0 z-10 bg-sunken px-3 py-2.5 font-medium whitespace-nowrap', right && 'text-right')}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        className={clsx('inline-flex items-center gap-1 hover:text-fg', sort.key === key && 'text-fg')}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUpRight className="size-3 rotate-45" /> : <ArrowDownRight className="size-3 -rotate-45" />)}
      </button>
    </th>
  )

  if (!rows.length) {
    return (
      <Card icon={<GitCompareArrows className="size-4" />} title="Price changes by station">
        <Empty icon={<History className="size-5" />} title="No recorded history for these stations yet">
          Add this area to <code className="rounded bg-sunken px-1 font-mono text-xs">collector/config.json</code> or keep the app open to record prices.
        </Empty>
      </Card>
    )
  }

  return (
    <>
      <Card
        icon={<GitCompareArrows className="size-4" />}
        title="Compare stations over time"
        sub="Tick stations in the table below to compare them (up to 8). Each line steps when the station changed its price."
      >
        <CompareChart rows={rows.filter((r) => compareIds.includes(r.s.id))} start={p.start} end={p.end} onSelect={p.onSelect} />
      </Card>

      <Card
        icon={<History className="size-4" />}
        title="Price changes by station"
        sub={`Increases and decreases per station · period: ${p.rangeLabel} · hover a row for the price line`}
      >
        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi label={`Raised price (${p.rangeLabel})`} value={<span className="text-rose-500">{ups} stations</span>} />
          <Kpi label={`Cut price (${p.rangeLabel})`} value={<span className="text-emerald-600 dark:text-emerald-400">{downs} stations</span>} />
          <Kpi label="Biggest drop" value={biggestDrop ? <span className="flex items-center gap-2"><Trend change={biggestDrop.dRange} size="md" /><span className="truncate text-xs font-normal text-muted">{biggestDrop.s.name}</span></span> : '—'} />
          <Kpi label="Biggest rise" value={biggestRise ? <span className="flex items-center gap-2"><Trend change={biggestRise.dRange} size="md" /><span className="truncate text-xs font-normal text-muted">{biggestRise.s.name}</span></span> : '—'} />
        </div>

        <div className="max-h-[560px] overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="sticky top-0 z-10 bg-sunken px-3 py-2.5 font-medium">
                  <span className="sr-only">Compare</span>
                </th>
                {head('name', 'Station', false)}
                {head('price', 'Now')}
                {head('d24', '24 h')}
                {head('d7', '7 days')}
                {head('d30', '30 days')}
                {head('dRange', `Period (${p.rangeLabel})`)}
                {head('moves', 'Changes')}
                <th className="sticky top-0 z-10 bg-sunken px-3 py-2.5 font-medium">Price line</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const on = compareIds.includes(r.s.id)
                const colorIdx = compareIds.indexOf(r.s.id)
                return (
                  <tr key={r.s.id} className="border-t border-line hover:bg-sunken/50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(r.s.id)}
                        aria-label={`Compare ${r.s.name}`}
                        className="size-4 cursor-pointer rounded"
                        style={{ accentColor: on ? LINE_COLORS[colorIdx % LINE_COLORS.length] : undefined }}
                      />
                    </td>
                    <td className="max-w-64 px-3 py-2">
                      <button type="button" onClick={() => p.onSelect(r.s)} className="block max-w-full text-left">
                        <span className="block truncate font-medium hover:text-accent">{r.s.name}</span>
                        <span className="block truncate text-xs text-muted">
                          <span style={{ color: brandColor(r.s.brand) }}>{r.s.brand}</span> · {r.s.city}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{r.price?.toFixed(3) ?? '—'}</td>
                    <td className="px-3 py-2 text-right"><Trend change={r.d24} /></td>
                    <td className="px-3 py-2 text-right"><Trend change={r.d7} /></td>
                    <td className="px-3 py-2 text-right"><Trend change={r.d30} /></td>
                    <td className="px-3 py-2 text-right"><Trend change={r.dRange} /></td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <span className="text-rose-500">{r.moves.up} up</span>
                      <span className="text-muted"> · </span>
                      <span className="text-emerald-600 dark:text-emerald-400">{r.moves.down} down</span>
                    </td>
                    <td className="px-3 py-2">
                      <Sparkline pts={r.pts} start={p.start} end={p.end} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
          <Info className="mt-px size-3 shrink-0" />
          “—” means no price was recorded at that time (not yet tracked, or the station was not among the cheapest that publish prices).
        </p>
      </Card>
    </>
  )
}

function CompareChart({
  rows,
  start,
  end,
  onSelect,
}: {
  rows: { s: Station; pts: Point[] }[]
  start: number
  end: number
  onSelect: (s: Station) => void
}) {
  const data = useMemo(() => {
    const times = new Set<number>([end])
    rows.forEach((r) => r.pts.forEach((p) => times.add(Math.max(p.t, start))))
    const sortedTimes = [...times].sort((a, b) => a - b)
    return sortedTimes.map((t) => {
      const row: Record<string, number | null> = { t }
      rows.forEach((r) => {
        let v: number | null = null
        for (const p of r.pts) if (p.t <= t) v = p.p
        row[`s${r.s.id}`] = v
      })
      return row
    })
  }, [rows, start, end])

  if (!rows.length) return <Empty icon={<GitCompareArrows className="size-5" />} title="Pick stations in the table below to compare them" />
  if (data.length < 2) return <Empty icon={<Clock3 className="size-5" />} title="Only one snapshot so far">Lines appear once prices have been recorded at least twice.</Empty>

  const span = end - start
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
        <XAxis dataKey="t" type="number" scale="time" domain={[data[0].t as number, end]} tick={tick} axisLine={axisLine} tickLine={false} minTickGap={40} tickFormatter={(t: number) => fmtTime(t, span)} />
        <YAxis domain={['dataMin - 0.01', 'dataMax + 0.01']} tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toFixed(2)} />
        <Tooltip
          cursor={{ stroke: 'var(--color-muted)', strokeDasharray: '3 3' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <TooltipBox
                title={fmtDateTime(Number(label))}
                rows={[...payload]
                  .filter((x) => x.value !== null && x.value !== undefined)
                  .sort((a, b) => Number(a.value) - Number(b.value))
                  .map((x) => ({ label: String(x.name), value: `€ ${Number(x.value).toFixed(3)}`, color: x.color as string }))}
              />
            )
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, cursor: 'pointer' }}
          formatter={(value) => <span className="text-fg">{value}</span>}
          onClick={(e) => {
            const r = rows.find((x) => `s${x.s.id}` === e.dataKey)
            if (r) onSelect(r.s)
          }}
        />
        {rows.map((r, i) => (
          <Line
            key={r.s.id}
            type="stepAfter"
            dataKey={`s${r.s.id}`}
            name={`${r.s.name} (${r.s.city})`}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Time-of-day / weekday patterns

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function TimePatterns({ stations, fuel, series, start, end }: { stations: Station[]; fuel: FuelType; series: Map<string, Point[]>; start: number; end: number }) {
  const pattern = useMemo(() => timePattern(stations.map((s) => series.get(seriesKey(s.id, fuel))!), start, end), [stations, series, fuel, start, end])
  const hours = pattern.hours.filter((h) => h.ct !== null) as { hour: number; ct: number; n: number }[]
  const days = pattern.weekdays.filter((d) => d.ct !== null) as { day: number; ct: number; n: number }[]
  const best = hours.length ? hours.reduce((m, h) => (h.ct < m.ct ? h : m)) : undefined
  const worst = hours.length ? hours.reduce((m, h) => (h.ct > m.ct ? h : m)) : undefined
  const bestDay = days.length ? days.reduce((m, d) => (d.ct < m.ct ? d : m)) : undefined
  const color = (ct: number) => (ct > 0.05 ? '#f43f5e' : ct < -0.05 ? '#10b981' : '#94a3b8')

  return (
    <Card
      icon={<Clock3 className="size-4" />}
      title="When is it cheapest to refuel?"
      sub="Typical price by hour and weekday compared with each station's own average — based on recorded history (Vienna time)"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium">By hour of day</span>
            {best && worst && (
              <span className="text-xs text-muted">
                Cheapest around <b className="text-emerald-600 dark:text-emerald-400">{String(best.hour).padStart(2, '0')}:00</b>, priciest around{' '}
                <b className="text-rose-500">{String(worst.hour).padStart(2, '0')}:00</b> ({((worst.ct - best.ct)).toFixed(1)} ct difference)
              </span>
            )}
          </div>
          {hours.length < 12 ? (
            <Empty icon={<Clock3 className="size-5" />} title="Needs at least a full day of snapshots">
              Run the collector with <code className="rounded bg-sunken px-1 font-mono text-xs">--watch 30</code> for a day or more to reveal the daily pattern.
            </Empty>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hours} margin={{ right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={tick} axisLine={axisLine} tickLine={false} tickFormatter={(h: number) => `${h}h`} interval={1} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={36} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
                <ReferenceLine y={0} stroke="var(--color-muted)" />
                <ReferenceLine x={12} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'noon', position: 'top', fill: '#f59e0b', fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: 'var(--color-sunken)', fillOpacity: 0.7 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const h = payload[0].payload as (typeof hours)[number]
                    return <TooltipBox title={`${String(h.hour).padStart(2, '0')}:00 – ${String(h.hour).padStart(2, '0')}:59`} rows={[{ label: 'vs. daily average', value: fmtCt(h.ct / 100, 2) }, { label: 'Samples', value: h.n }]} />
                  }}
                />
                <Bar dataKey="ct" radius={[3, 3, 3, 3]}>
                  {hours.map((h) => (
                    <Cell key={h.hour} fill={color(h.ct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">By weekday</span>
            {bestDay && <span className="text-xs text-muted">Cheapest: <b className="text-emerald-600 dark:text-emerald-400">{WEEKDAYS[bestDay.day]}</b></span>}
          </div>
          {days.length < 7 ? (
            <Empty icon={<CalendarClock className="size-5" />} title="Needs about a week of snapshots" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={days} margin={{ right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={tick} axisLine={axisLine} tickLine={false} tickFormatter={(d: number) => WEEKDAYS[d]} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={36} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
                <ReferenceLine y={0} stroke="var(--color-muted)" />
                <Tooltip
                  cursor={{ fill: 'var(--color-sunken)', fillOpacity: 0.7 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as (typeof days)[number]
                    return <TooltipBox title={WEEKDAYS[d.day]} rows={[{ label: 'vs. weekly average', value: fmtCt(d.ct / 100, 2) }, { label: 'Station-days', value: d.n }]} />
                  }}
                />
                <Bar dataKey="ct" radius={[3, 3, 3, 3]}>
                  {days.map((d) => (
                    <Cell key={d.day} fill={color(d.ct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted">
        <Info className="mt-px size-3 shrink-0" />
        In Austria, stations may raise prices only once a day, at 12:00 noon; price cuts are allowed at any time. Bars below zero mean cheaper than usual.
      </p>
    </Card>
  )
}
