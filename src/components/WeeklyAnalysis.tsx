import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, CalendarDays, CalendarRange, Info, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FuelType } from '../api/econtrol'
import { priceRank, rankColor } from '../lib/filters'
import { seriesKey, viennaParts, type Point } from '../lib/historyData'
import type { Station } from '../lib/station'
import { addDays, dailyStats, fmtDay, forecastNextWeek, weekGrid, weekStart, WEEKDAYS, WEEKDAYS_LONG, type DayStat, type Metric } from '../lib/weekly'

const DAY = 86_400_000
const tick = { fill: 'var(--color-muted)', fontSize: 11 }

function ct(diff: number, digits = 1) {
  const v = diff * 100
  if (Math.abs(v) < 0.05) return '±0.0 ct'
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)} ct`
}

function Delta({ diff, className }: { diff: number | undefined; className?: string }) {
  if (diff === undefined) return null
  const flat = Math.abs(diff) < 0.0005
  const Icon = flat ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={clsx('inline-flex items-center gap-0.5 font-mono tabular-nums', flat ? 'text-muted' : diff > 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400', className)}>
      <Icon className="size-3" />
      {ct(diff)}
    </span>
  )
}

/** ISO week number, for row labels. */
function isoWeek(day: string) {
  const d = new Date(`${day}T12:00:00Z`)
  const wd = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - wd + 3)
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((d.getTime() - firstThu.getTime()) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
}

export function WeeklyAnalysis({
  stations,
  fuel,
  series,
  now,
  onSelect,
}: {
  stations: Station[]
  fuel: FuelType
  series: Map<string, Point[]>
  now: number
  onSelect: (s: Station) => void
}) {
  const [weeks, setWeeks] = useState(4)
  const [scope, setScope] = useState<'area' | number>('area')
  const [metric, setMetric] = useState<Metric>('avg')

  const today = viennaParts(now).day
  // Start on the Monday `weeks - 1` weeks before this week, so rows are whole weeks.
  const firstDay = addDays(weekStart(today), -(weeks - 1) * 7)
  const start = now - (weeks * 7 + 1) * DAY // generous; days before `firstDay` are dropped below

  const scopeStation = scope === 'area' ? undefined : stations.find((s) => s.id === scope)
  const effectiveScope = scopeStation ? scopeStation.id : 'area'

  const days = useMemo(() => {
    const list = scopeStation ? [scopeStation] : stations
    return dailyStats(list.map((s) => series.get(seriesKey(s.id, fuel))!).filter(Boolean), start, now).filter((d) => d.day >= firstDay)
  }, [stations, scopeStation, series, fuel, start, now, firstDay])

  // The forecast uses up to 6 weeks of history regardless of the display window.
  const forecast = useMemo(() => {
    const list = scopeStation ? [scopeStation] : stations
    const all = dailyStats(list.map((s) => series.get(seriesKey(s.id, fuel))!).filter(Boolean), now - 42 * DAY, now)
    return forecastNextWeek(all, metric, today)
  }, [stations, scopeStation, series, fuel, now, metric, today])

  const grid = weekGrid(days)
  const vals = days.map((d) => d[metric])
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 0
  const periodAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  const cheapestDay = days.length ? days.reduce((m, d) => (d[metric] < m[metric] ? d : m)) : undefined
  const priciestDay = days.length ? days.reduce((m, d) => (d[metric] > m[metric] ? d : m)) : undefined

  // This week vs. last week, comparing the same weekdays only.
  const thisWeek = grid.find((w) => w.start === weekStart(today))
  const lastWeek = grid.find((w) => w.start === addDays(weekStart(today), -7))
  let wow: number | undefined
  if (thisWeek && lastWeek) {
    const pairs = thisWeek.cells.map((c, i) => (c && lastWeek.cells[i] ? [c[metric], lastWeek.cells[i]![metric]] : null)).filter(Boolean) as number[][]
    if (pairs.length) wow = pairs.reduce((a, [x, y]) => a + x - y, 0) / pairs.length
  }

  // Average per weekday across the shown weeks, and how often each was the week's cheapest.
  const weekdayAvg = WEEKDAYS.map((_, wd) => {
    const v = days.filter((d) => d.weekday === wd && !d.partial).map((d) => d[metric])
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  })
  const weekCheapest = grid.map((w) => {
    const cells = w.cells.map((c) => (c && !c.partial ? c[metric] : null))
    const present = cells.filter((v): v is number => v !== null)
    return present.length >= 2 ? cells.indexOf(Math.min(...present)) : -1
  })

  const chartData = days.map((d) => ({ ...d, value: d[metric], label: fmtDay(d.day) }))
  const scopeLabel = scopeStation ? `${scopeStation.name} (${scopeStation.city})` : `All ${stations.length} stations in your results`

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
              <CalendarDays className="size-4" />
            </span>
            <div>
              <h3 className="leading-tight font-semibold">Day by day — last {weeks} week{weeks > 1 ? 's' : ''}</h3>
              <p className="text-xs text-muted">Which day was cheaper, and how prices moved week to week · from recorded snapshots (Vienna time)</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={effectiveScope}
              onChange={(e) => setScope(e.target.value === 'area' ? 'area' : Number(e.target.value))}
              className="h-8 max-w-64 rounded-lg border border-line bg-surface px-2 text-xs font-medium"
              aria-label="Station"
            >
              <option value="area">All stations in results</option>
              {[...stations]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city})
                  </option>
                ))}
            </select>
            <Pills
              value={metric}
              onChange={setMetric}
              options={[
                { id: 'avg', label: 'Daily average' },
                { id: 'low', label: 'Daily low' },
              ]}
            />
            <Pills value={weeks} onChange={setWeeks} options={[1, 2, 3, 4].map((w) => ({ id: w, label: `${w}W` }))} />
          </div>
        </header>

        {!days.length ? (
          <EmptyState icon={<CalendarDays className="size-5" />} title="No daily data for this selection yet">
            Daily prices come from recorded snapshots. Keep <code className="rounded bg-sunken px-1 font-mono text-xs">npm run collect -- --watch 30</code> running; the first full day appears tomorrow.
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 truncate text-xs text-muted">
              Showing: <span className="font-medium text-fg">{scopeLabel}</span> · {metric === 'avg' ? 'time-weighted average price per day' : 'lowest price seen each day'}
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Kpi
                label="Cheapest day"
                value={cheapestDay ? `€ ${cheapestDay[metric].toFixed(3)}` : '—'}
                sub={cheapestDay ? fmtDay(cheapestDay.day, { weekday: 'long', day: '2-digit', month: '2-digit' }) : ''}
                tone="good"
              />
              <Kpi
                label="Most expensive day"
                value={priciestDay ? `€ ${priciestDay[metric].toFixed(3)}` : '—'}
                sub={priciestDay ? fmtDay(priciestDay.day, { weekday: 'long', day: '2-digit', month: '2-digit' }) : ''}
                tone="bad"
              />
              <Kpi label="This week vs. last week" value={wow !== undefined ? <Delta diff={wow} className="text-base font-semibold" /> : '—'} sub={wow !== undefined ? 'same weekdays compared' : 'needs two weeks of data'} />
              <Kpi
                label="Price swing in period"
                value={`${((max - min) * 100).toFixed(1)} ct`}
                sub={`€ ${min.toFixed(3)} – € ${max.toFixed(3)}`}
              />
            </div>

            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 18, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={tick} axisLine={{ stroke: 'var(--color-line)' }} tickLine={false} interval={chartData.length > 14 ? 1 : 0} />
                <YAxis domain={[(dataMin: number) => Math.floor((dataMin - 0.005) * 100) / 100, (dataMax: number) => Math.ceil((dataMax + 0.003) * 100) / 100]} tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toFixed(2)} />
                <ReferenceLine y={periodAvg} stroke="var(--color-accent)" strokeDasharray="5 4" label={{ value: 'avg', position: 'right', fill: 'var(--color-accent)', fontSize: 10 }} />
                {chartData.filter((d) => d.weekday === 0).map((d) => (
                  <ReferenceLine key={d.day} x={d.label} stroke="var(--color-line)" />
                ))}
                <Tooltip
                  cursor={{ fill: 'var(--color-sunken)', fillOpacity: 0.7 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as DayStat & { value: number }
                    return (
                      <div className="min-w-48 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg shadow-xl">
                        <div className="mb-1 font-semibold">{fmtDay(d.day, { weekday: 'long', day: '2-digit', month: 'long' })}</div>
                        <TipRow label="Average" value={`€ ${d.avg.toFixed(3)}`} />
                        <TipRow label="Lowest" value={`€ ${d.low.toFixed(3)}`} />
                        <TipRow label="Highest" value={`€ ${d.high.toFixed(3)}`} />
                        <TipRow label="vs. period average" value={ct(d.value - periodAvg)} />
                        {!scopeStation && <TipRow label="Stations" value={String(d.stations)} />}
                        {d.partial && <div className="mt-1 text-amber-500">Partial day ({d.hours} h recorded)</div>}
                      </div>
                    )
                  }}
                />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.day} fill={rankColor(priceRank(d.value, min, max))} fillOpacity={d.partial ? 0.45 : 1} />
                  ))}
                  {chartData.length <= 14 && <LabelList dataKey="value" position="top" formatter={(v) => Number(v).toFixed(3)} style={{ fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[11px] text-muted">Faded bars are days that were not fully recorded (e.g. today). Vertical lines mark the start of each week.</p>

            {/* Week × weekday grid */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="w-36 text-left font-medium">Week</th>
                    {WEEKDAYS.map((d) => (
                      <th key={d} className="font-medium">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((w, wi) => {
                    const prev = grid[wi - 1]
                    return (
                      <tr key={w.start}>
                        <td className="pr-2 text-xs">
                          <div className="font-semibold">Week {isoWeek(w.start)}</div>
                          <div className="text-muted">
                            {fmtDay(w.start, { day: '2-digit', month: '2-digit' })} – {fmtDay(addDays(w.start, 6), { day: '2-digit', month: '2-digit' })}
                          </div>
                        </td>
                        {w.cells.map((c, i) => {
                          if (!c) return <td key={i} className="h-14 rounded-lg bg-sunken/50" />
                          const v = c[metric]
                          const r = priceRank(v, min, max)
                          const before = prev?.cells[i]
                          const isCheapest = weekCheapest[wi] === i
                          return (
                            <td
                              key={i}
                              title={`${fmtDay(c.day, { weekday: 'long', day: '2-digit', month: '2-digit' })}: € ${v.toFixed(3)}`}
                              className={clsx('relative h-14 rounded-lg px-1.5 text-center align-middle', isCheapest && 'ring-2 ring-emerald-500')}
                              style={{ background: `color-mix(in srgb, ${rankColor(r)} ${c.partial ? 10 : 22}%, transparent)` }}
                            >
                              <div className={clsx('font-mono text-[13px] font-semibold tabular-nums', c.partial && 'opacity-60')}>{v.toFixed(3)}</div>
                              {before ? <Delta diff={v - before[metric]} className="text-[10px]" /> : <div className="text-[10px] text-muted">{fmtDay(c.day, { day: '2-digit', month: '2-digit' })}</div>}
                              {isCheapest && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">LOW</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <tr>
                    <td className="pt-2 pr-2 text-xs font-semibold">Avg. by weekday</td>
                    {weekdayAvg.map((v, i) => {
                      const present = weekdayAvg.filter((x): x is number => x !== null)
                      const best = present.length > 1 && v === Math.min(...present)
                      return (
                        <td key={i} className={clsx('pt-2 text-center font-mono text-xs tabular-nums', best ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-muted')}>
                          {v !== null ? v.toFixed(3) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-muted">
                Small arrows compare with the same weekday one week earlier. <span className="font-semibold text-emerald-600 dark:text-emerald-400">LOW</span> marks the cheapest fully-recorded day of each week.
              </p>
            </div>
          </>
        )}
      </section>

      <ForecastCard forecast={forecast} metric={metric} scopeLabel={scopeLabel} onSelectStation={scopeStation ? () => onSelect(scopeStation) : undefined} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function ForecastCard({ forecast: f, metric, scopeLabel }: { forecast: ReturnType<typeof forecastNextWeek>; metric: Metric; scopeLabel: string; onSelectStation?: () => void }) {
  const confidence = {
    none: { label: 'Not enough data', cls: 'bg-sunken text-muted' },
    low: { label: 'Low confidence', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    medium: { label: 'Medium confidence', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
    good: { label: 'Good confidence', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  }[f.confidence]
  const needed = 7
  const values = f.days.map((d) => d.value)
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 0
  const weekAvg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const topWinner = f.cheapestWins.some((w) => w > 0) ? f.cheapestWins.indexOf(Math.max(...f.cheapestWins)) : -1

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-500">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h3 className="leading-tight font-semibold">Next 7 days — when will it be cheapest?</h3>
            <p className="text-xs text-muted">
              Forecast for {scopeLabel} · {metric === 'avg' ? 'daily average' : 'daily low'} · weekday pattern + current trend
            </p>
          </div>
        </div>
        <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', confidence.cls)}>{confidence.label}</span>
      </header>

      {f.confidence === 'none' ? (
        <div className="rounded-xl bg-sunken p-4">
          <p className="text-sm font-medium">Needs at least {needed} fully recorded days to spot a weekly pattern</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (f.basisDays / needed) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {f.basisDays} of {needed} days recorded. The forecast gets more reliable with every week: 1 week = rough, 3+ weeks = good.
          </p>
        </div>
      ) : (
        <>
          {f.best && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-500/15 to-transparent p-3">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-500 text-white">
                <CalendarRange className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  Best day to refuel in the next 7 days: <b className="text-emerald-600 dark:text-emerald-400">{WEEKDAYS_LONG[f.best.weekday]}, {fmtDay(f.best.day, { day: '2-digit', month: '2-digit' })}</b>
                </p>
                <p className="text-xs text-muted">
                  Expected around € {f.best.value.toFixed(3)} — {((weekAvg - f.best.value) * 100).toFixed(1)} ct below the expected average for these 7 days
                  {f.worst && f.worst.weekday !== f.best.weekday && <>; avoid {WEEKDAYS_LONG[f.worst.weekday]} (≈ € {f.worst.value.toFixed(3)})</>}.
                </p>
              </div>
              <div className="text-right text-xs">
                <div className="text-muted">Trend</div>
                <div className={clsx('inline-flex items-center gap-1 font-mono font-semibold', f.slopePerWeek > 0.0005 ? 'text-rose-500' : f.slopePerWeek < -0.0005 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted')}>
                  {f.slopePerWeek > 0.0005 ? <TrendingUp className="size-3.5" /> : f.slopePerWeek < -0.0005 ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />}
                  {ct(f.slopePerWeek)} / week
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-7 gap-1.5">
            {f.days.map((d) => {
              const isBest = f.best?.day === d.day
              const isWorst = f.worst?.day === d.day && !isBest
              const known = f.weekdayOffsets[d.weekday] !== null
              const r = hi === lo ? 0.5 : (d.value - lo) / (hi - lo)
              return (
                <div
                  key={d.day}
                  className={clsx(
                    'relative flex flex-col items-center rounded-xl border px-1 py-2.5 text-center',
                    isBest ? 'border-emerald-500 bg-emerald-500/10' : isWorst ? 'border-rose-500/50 bg-rose-500/5' : 'border-line',
                  )}
                >
                  <div className="text-xs font-semibold">{WEEKDAYS[d.weekday]}</div>
                  <div className="text-[10px] text-muted">{fmtDay(d.day, { day: '2-digit', month: '2-digit' })}</div>
                  <div className="mt-2 flex h-14 w-full items-end justify-center">
                    <div className="w-5 rounded-t-md" style={{ height: `${20 + r * 80}%`, background: known ? rankColor(r) : 'var(--color-line)' }} />
                  </div>
                  <div className={clsx('mt-1.5 font-mono text-[12px] font-semibold tabular-nums', !known && 'text-muted')}>{d.value.toFixed(3)}</div>
                  <div className="font-mono text-[9px] text-muted">± {(f.spread * 100).toFixed(1)} ct</div>
                  {isBest && <span className="absolute -top-2 rounded-full bg-emerald-500 px-1.5 text-[9px] font-bold text-white">BEST</span>}
                  {!known && <span className="mt-0.5 text-[9px] text-amber-500">no data yet</span>}
                </div>
              )
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-sunken p-3">
              <div className="mb-2 text-xs font-medium text-muted">Typical weekday effect (vs. trend)</div>
              <div className="flex items-end gap-1.5">
                {f.weekdayOffsets.map((o, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className={clsx('font-mono text-[10px] tabular-nums', o === null ? 'text-muted' : o > 0.0005 ? 'text-rose-500' : o < -0.0005 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted')}>
                      {o === null ? '—' : `${o > 0 ? '+' : ''}${(o * 100).toFixed(1)}`}
                    </span>
                    <span className="text-[10px] text-muted">{WEEKDAYS[i]}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted">in cents · negative = usually cheaper</p>
            </div>
            <div className="rounded-xl bg-sunken p-3">
              <div className="mb-2 text-xs font-medium text-muted">Cheapest day of the week, past {f.fullWeeks} full week{f.fullWeeks === 1 ? '' : 's'}</div>
              {f.fullWeeks === 0 ? (
                <p className="text-xs text-muted">Appears once a full Monday–Sunday week has been recorded.</p>
              ) : (
                <div className="flex gap-1.5">
                  {f.cheapestWins.map((w, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <span className={clsx('grid size-7 place-items-center rounded-lg text-xs font-bold', w ? 'bg-emerald-500 text-white' : 'bg-surface text-muted')} style={w ? { opacity: 0.4 + 0.6 * (w / Math.max(...f.cheapestWins)) } : undefined}>
                        {w}×
                      </span>
                      <span className={clsx('text-[10px]', i === topWinner ? 'font-semibold text-fg' : 'text-muted')}>{WEEKDAYS[i]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted">
        <Info className="mt-px size-3 shrink-0" />
        Based on {f.basisDays} fully recorded day{f.basisDays === 1 ? '' : 's'}. The forecast repeats recent weekday habits on top of the current trend; it cannot foresee oil-market moves, tax changes or holidays. In Austria, stations may raise prices only once a day at 12:00, so mornings are often cheaper than afternoons.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------

function Pills<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', value === o.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-sunken px-3 py-2">
      <div className="truncate text-[11px] text-muted">{label}</div>
      <div className={clsx('font-mono text-base font-semibold tabular-nums', tone === 'good' && 'text-emerald-600 dark:text-emerald-400', tone === 'bad' && 'text-rose-500')}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-sunken text-muted">{icon}</span>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}
