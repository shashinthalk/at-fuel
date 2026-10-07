// Daily / weekly / monthly price records per area, read from the summaries
// that collector/rollup.mjs writes after every collection run.
import clsx from 'clsx'
import { CalendarDays, CalendarRange, MapPin, Sun, Trophy } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { FUEL_TYPES, type FuelType } from '../api/econtrol'
import { usePriceRecords } from '../hooks/useHistoryData'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { viennaParts, type LowestDay, type WeekFile } from '../lib/historyData'
import { addDays, fmtDay, WEEKDAYS } from '../lib/weekly'

const ALL = 'All areas'
const WEEK_LABELS = ['This week', 'Last week', '2 weeks ago', '3 weeks ago']

const eur = (v: number) => `€ ${v.toFixed(3)}`
const time = (iso: string) => new Date(iso).toLocaleTimeString('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' })
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function Panel({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        <h4 className="text-sm font-semibold">{title}</h4>
        {sub && <span className="ml-auto text-xs text-muted">{sub}</span>}
      </div>
      {children}
    </div>
  )
}

function Lowest({ low }: { low: LowestDay | null | undefined }) {
  if (!low) return <p className="text-xs text-muted">No prices recorded.</p>
  return (
    <p className="text-xs">
      <span className="text-muted">Lowest: </span>
      <span className="font-semibold">{fmtDay(low.day, { weekday: 'long', day: '2-digit', month: '2-digit' })}</span>
      <span className="font-mono font-semibold text-emerald-600 tabular-nums dark:text-emerald-400"> {eur(low.price)}</span>
      <span className="text-muted">
        {' '}
        from {time(low.at)} · {low.station.name}
        {low.station.city && `, ${low.station.city}`}
      </span>
    </p>
  )
}

function WeekCard({ week, label, area, fuel }: { week: WeekFile; label: string; area: string; fuel: FuelType }) {
  const data = week.areas[area]?.[fuel]
  const byWeekday = new Map(data?.days.map((d) => [d.weekday, d]))
  return (
    <Panel icon={<CalendarDays className="size-4" />} title={label} sub={`${fmtDay(week.start, { day: '2-digit', month: '2-digit' })} – ${fmtDay(week.end, { day: '2-digit', month: '2-digit' })}`}>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((wd, i) => {
          const d = byWeekday.get(i)
          const best = !!d && data?.lowest?.day === d.day
          return (
            <div
              key={wd}
              title={d ? `${fmtDay(d.day)} · low ${eur(d.low)} · avg ${eur(d.avg)} · high ${eur(d.high)}${d.partial ? ' · partial day' : ''}` : fmtDay(addDays(week.start, i))}
              className={clsx(
                'rounded-md px-0.5 py-1.5 text-center',
                best ? 'bg-emerald-500/15 ring-1 ring-emerald-500/60' : 'bg-sunken',
                d?.partial && 'opacity-70',
              )}
            >
              <div className="text-[10px] text-muted">{wd}</div>
              <div className={clsx('font-mono text-[11px] font-semibold tabular-nums', best && 'text-emerald-600 dark:text-emerald-400')}>
                {d ? d.low.toFixed(3) : '—'}
              </div>
            </div>
          )
        })}
      </div>
      <Lowest low={data?.lowest} />
    </Panel>
  )
}

export function PriceRecords({ fuel, now }: { fuel: FuelType; now: number }) {
  const { daily, weeks, months, isLoading } = usePriceRecords()
  const [chosen, setArea] = useLocalStorage('fuel:recordArea', ALL)

  const areas = useMemo(() => {
    const names = new Set<string>()
    for (const w of weeks) Object.keys(w.areas).forEach((a) => names.add(a))
    Object.keys(daily?.areas ?? {}).forEach((a) => names.add(a))
    names.delete(ALL)
    return [ALL, ...[...names].sort((a, b) => a.localeCompare(b, 'de'))]
  }, [daily, weeks])
  const area = areas.includes(chosen) ? chosen : ALL
  const fuelLabel = FUEL_TYPES.find((f) => f.id === fuel)!.label

  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl bg-sunken" />
  if (!daily && !weeks.length && !months) {
    return (
      <section className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
        No price records yet. They are created by the collector (<code className="rounded bg-sunken px-1 font-mono text-xs">npm run collect</code>) or by{' '}
        <code className="rounded bg-sunken px-1 font-mono text-xs">npm run history:rollup</code>.
      </section>
    )
  }

  const today = daily?.areas[area]?.[fuel]
  const monthRows = Object.entries(months?.months ?? {})
    .map(([m, v]) => ({ m, rec: v.areas[area]?.[fuel] }))
    .filter((r) => r.rec)
    .reverse()

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
            <Trophy className="size-4" />
          </span>
          <div>
            <h3 className="leading-tight font-semibold">Lowest prices by day, week and month</h3>
            <p className="text-xs text-muted">{fuelLabel} · lowest price at any station in the area · Austrian time · updated with every collector run</p>
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <MapPin className="size-3.5 text-muted" />
          <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs">
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="space-y-3">
        <Panel icon={<Sun className="size-4" />} title={daily ? `${daily.day === viennaParts(now).day ? 'Today' : 'Latest day'}, ${fmtDay(daily.day, { weekday: 'long', day: '2-digit', month: '2-digit' })}` : 'Today'} sub={daily && `as of ${time(daily.updatedAt)}`}>
          {today ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ['Low', today.low, 'text-emerald-600 dark:text-emerald-400'],
                    ['Average', today.avg, ''],
                    ['High', today.high, 'text-rose-500'],
                  ] as const
                ).map(([label, v, cls]) => (
                  <div key={label} className="rounded-lg bg-sunken p-2">
                    <div className="text-[11px] text-muted">{label}</div>
                    <div className={clsx('font-mono text-sm font-semibold tabular-nums', cls)}>{eur(v)}</div>
                  </div>
                ))}
                <p className="col-span-3 text-left text-xs text-muted">
                  Low from {time(today.lowAt)} at {today.lowStation.name} · {today.stations} stations
                </p>
              </div>
              <ol className="space-y-1 text-xs">
                {today.cheapestNow.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="w-4 text-muted">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">
                      {s.name}
                      {s.city && <span className="text-muted">, {s.city}</span>}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">{eur(s.price)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-xs text-muted">No {fuelLabel} prices recorded for this day in this area.</p>
          )}
        </Panel>

        <div className="grid gap-3 lg:grid-cols-2">
          {weeks.map((w) => (
            <WeekCard key={w.week} week={w} label={WEEK_LABELS[w.week - 1] ?? `Week ${w.week}`} area={area} fuel={fuel} />
          ))}
        </div>

        <Panel icon={<CalendarRange className="size-4" />} title="Monthly lows">
          {monthRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Month</th>
                    <th className="py-1 pr-3 font-medium">Lowest day</th>
                    <th className="py-1 pr-3 text-right font-medium">Lowest price</th>
                    <th className="py-1 pr-3 font-medium">Station</th>
                    <th className="py-1 pr-3 text-right font-medium">Month avg</th>
                    <th className="py-1 text-right font-medium">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map(({ m, rec }) => (
                    <tr key={m} className="border-t border-line">
                      <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{monthName(m)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{rec!.lowest ? fmtDay(rec!.lowest.day, { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—'}</td>
                      <td className="py-1.5 pr-3 text-right font-mono font-semibold whitespace-nowrap text-emerald-600 tabular-nums dark:text-emerald-400">
                        {rec!.lowest ? eur(rec!.lowest.price) : '—'}
                      </td>
                      <td className="max-w-56 truncate py-1.5 pr-3 text-muted">{rec!.lowest?.station.name}</td>
                      <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap tabular-nums">{eur(rec!.avg)}</td>
                      <td className="py-1.5 text-right tabular-nums">{rec!.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted">No months recorded for this area yet.</p>
          )}
        </Panel>
      </div>
    </section>
  )
}
