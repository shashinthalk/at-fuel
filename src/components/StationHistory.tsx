import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FUEL_TYPES, type FuelType } from '../api/econtrol'
import { useHistoryData } from '../hooks/useHistoryData'
import { changeOver, seriesKey, sliceSeries } from '../lib/historyData'

const DAY = 86_400_000
const RANGES = [
  { id: '7d', label: '7 d', ms: 7 * DAY },
  { id: '30d', label: '30 d', ms: 30 * DAY },
  { id: 'all', label: 'All', ms: null },
] as const

function fmtDiff(d: number) {
  const ct = d * 100
  return `${ct > 0 ? '+' : ct < 0 ? '−' : '±'}${Math.abs(ct).toFixed(1)} ct`
}

/** Price history of one station: chart, period changes and a log of recent price moves. */
export function StationHistory({ stationId, fuel: initialFuel, stamp }: { stationId: number; fuel: FuelType; stamp: number }) {
  const { data } = useHistoryData(stamp)
  const [fuel, setFuel] = useState<FuelType>(initialFuel)
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('7d')
  const now = Date.now()

  const available = FUEL_TYPES.filter((f) => data.series.get(seriesKey(stationId, f.id))?.some((p) => p.p !== null))
  const pts = data.series.get(seriesKey(stationId, fuel))
  const span = RANGES.find((r) => r.id === range)!.ms
  const start = span ? now - span : (pts?.[0]?.t ?? now)

  const chart = useMemo(() => {
    const sliced = sliceSeries(pts, start, now)
    const last = sliced[sliced.length - 1]
    return last ? [...sliced, { t: now, p: last.p }] : []
  }, [pts, start, now])

  // Recent moves, newest first.
  const moves = useMemo(() => {
    const out: { t: number; from: number; to: number }[] = []
    let prev: number | null = null
    for (const p of pts ?? []) {
      if (p.p === null) continue
      if (prev !== null && p.p !== prev) out.push({ t: p.t, from: prev, to: p.p })
      prev = p.p
    }
    return out.reverse().slice(0, 8)
  }, [pts])

  const changes = [
    { label: '24 h', c: changeOver(pts, now, DAY) },
    { label: '7 days', c: changeOver(pts, now, 7 * DAY) },
    { label: '30 days', c: changeOver(pts, now, 30 * DAY) },
  ]
  const firstSeen = pts?.[0]?.t

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg bg-sunken p-0.5">
          {FUEL_TYPES.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={!available.some((a) => a.id === f.id)}
              onClick={() => setFuel(f.id)}
              className={clsx('rounded-md px-2 py-1 text-xs font-medium disabled:opacity-35', fuel === f.id ? 'bg-surface shadow-sm' : 'text-muted hover:text-fg')}
            >
              {f.short}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg bg-sunken p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={clsx('rounded-md px-2 py-1 text-xs font-medium', range === r.id ? 'bg-surface shadow-sm' : 'text-muted hover:text-fg')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {changes.map(({ label, c }) => (
          <div key={label} className="rounded-lg bg-sunken px-2 py-1.5 text-center">
            <div className="text-[10px] text-muted">vs. {label} ago</div>
            <div
              className={clsx(
                'font-mono text-sm font-semibold tabular-nums',
                !c ? 'text-muted' : c.diff > 0.0004 ? 'text-rose-500' : c.diff < -0.0004 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted',
              )}
            >
              {c ? fmtDiff(c.diff) : '—'}
            </div>
          </div>
        ))}
      </div>

      {chart.filter((p) => p.p !== null).length < 2 ? (
        <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
          {firstSeen ? `Tracked since ${new Date(firstSeen).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })}. ` : 'Not tracked yet. '}
          The chart fills in as more snapshots are recorded.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={chart} margin={{ top: 6, right: 6 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, now]}
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              axisLine={{ stroke: 'var(--color-line)' }}
              tickLine={false}
              minTickGap={30}
              tickFormatter={(t: number) => new Date(t).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}
            />
            <YAxis domain={['dataMin - 0.01', 'dataMax + 0.01']} tickFormatter={(v: number) => v.toFixed(2)} width={40} tick={{ fill: 'var(--color-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ stroke: 'var(--color-muted)', strokeDasharray: '3 3' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg shadow-lg">
                    <div className="text-muted">{new Date(payload[0].payload.t).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    <div className="font-mono font-semibold">{payload[0].value === null ? 'No price published' : `€ ${Number(payload[0].value).toFixed(3)}`}</div>
                  </div>
                ) : null
              }
            />
            <Line type="stepAfter" dataKey="p" stroke="var(--color-accent)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {moves.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted">Recent price changes</div>
          <ul className="divide-y divide-line rounded-lg border border-line text-xs">
            {moves.map((m) => {
              const up = m.to > m.from
              return (
                <li key={m.t} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="text-muted">{new Date(m.t).toLocaleString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="font-mono tabular-nums">
                    {m.from.toFixed(3)} → {m.to.toFixed(3)}
                  </span>
                  <span className={clsx('inline-flex items-center gap-0.5 font-mono font-semibold', up ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>
                    {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                    {fmtDiff(m.to - m.from)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
