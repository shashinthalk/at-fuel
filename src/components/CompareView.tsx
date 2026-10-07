import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AlertTriangle,
  BadgeCheck,
  Car,
  Clock,
  Crosshair,
  Droplets,
  Euro,
  Gauge,
  Info,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Route as RouteIcon,
  Scale,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FUEL_TYPES, type FuelType } from '../api/econtrol'
import { MAX_COMPARE } from '../hooks/useLocalStorage'
import { brandColor } from '../lib/brand'
import { decide, evaluate, type CompareInputs, type Option } from '../lib/compare'
import type { LatLon } from '../lib/geo'
import { reverseGeocode } from '../lib/geocode'
import { routesFrom } from '../lib/routing'
import type { Station } from '../lib/station'
import { TileImage } from './LocationImage'

const VEHICLES = [
  { label: 'Small car', value: 5 },
  { label: 'Compact', value: 6.5 },
  { label: 'SUV', value: 9 },
  { label: 'Van', value: 11 },
]
const BUDGETS = [20, 30, 50, 80]
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899']

const eur = (n: number) => `€ ${n.toFixed(2)}`
const lit = (n: number) => `${n.toFixed(2)} L`
const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`)
const min = (n: number) => (n < 1 ? '< 1 min' : n < 60 ? `${Math.round(n)} min` : `${Math.floor(n / 60)} h ${Math.round(n % 60)} min`)

export function CompareView({
  allStations,
  candidates,
  compareIds,
  onToggle,
  onClear,
  fuel,
  inputs,
  setInputs,
  defaultStart,
  defaultStartLabel,
  onSelect,
}: {
  allStations: Station[]
  candidates: Station[]
  compareIds: number[]
  onToggle: (id: number) => void
  onClear: () => void
  fuel: FuelType
  inputs: CompareInputs
  setInputs: (i: CompareInputs) => void
  defaultStart: LatLon | null
  defaultStartLabel: string
  onSelect: (s: Station) => void
}) {
  const [customStart, setCustomStart] = useState<{ point: LatLon; label: string } | null>(null)
  const [locating, setLocating] = useState(false)
  const start = customStart?.point ?? defaultStart
  const startLabel = customStart?.label ?? defaultStartLabel

  const picked = compareIds.map((id) => allStations.find((s) => s.id === id)).filter((s): s is Station => !!s)
  const missing = compareIds.length - picked.length
  const priced = picked.filter((s) => s.prices[fuel] !== undefined)
  const unpriced = picked.filter((s) => s.prices[fuel] === undefined)
  const fuelLabel = FUEL_TYPES.find((f) => f.id === fuel)!.label

  const routes = useQuery({
    queryKey: ['routes', start?.lat, start?.lon, priced.map((s) => s.id).join(',')],
    queryFn: ({ signal }) => routesFrom(start!, priced.map((s) => ({ lat: s.lat, lon: s.lon })), signal),
    enabled: !!start && priced.length > 0,
    staleTime: 10 * 60 * 1000,
  })

  const options: Option[] = routes.data ? priced.map((s, i) => evaluate(s.prices[fuel]!, routes.data![i], s.id, inputs)) : []
  const verdict = decide(options, inputs)
  const byId = (id: number) => picked.find((s) => s.id === id)!

  const set = <K extends keyof CompareInputs>(k: K, v: CompareInputs[K]) => setInputs({ ...inputs, [k]: v })

  const locate = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        setCustomStart({ point, label: `Your location (${await reverseGeocode(point.lat, point.lon)})` })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const addable = candidates.filter((s) => !compareIds.includes(s.id) && s.prices[fuel] !== undefined).slice(0, 60)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* ---------------- Inputs ---------------- */}
      <aside className="space-y-4 xl:sticky xl:top-[130px] xl:self-start">
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h3 className="mb-1 flex items-center gap-2 font-semibold">
            <Car className="size-4 text-accent" /> Your vehicle & fill-up
          </h3>
          <p className="mb-4 text-xs text-muted">Tell us about your car and how much you want to fuel. Everything is saved in this browser.</p>

          <Field label="Average consumption" icon={<Gauge className="size-3.5" />}>
            <NumberInput value={inputs.consumption} step={0.1} suffix="L / 100 km" onChange={(v) => set('consumption', v)} />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {VEHICLES.map((v) => (
                <Preset key={v.label} active={inputs.consumption === v.value} onClick={() => set('consumption', v.value)}>
                  {v.label} · {v.value}
                </Preset>
              ))}
            </div>
          </Field>

          <Field label="How do you want to fuel up?" icon={<Euro className="size-3.5" />}>
            <Toggle
              value={inputs.mode}
              onChange={(v) => set('mode', v)}
              options={[
                { id: 'budget', label: 'Fixed budget (€)' },
                { id: 'litres', label: 'Fixed litres' },
              ]}
            />
            {inputs.mode === 'budget' ? (
              <>
                <NumberInput value={inputs.budget} step={5} suffix="€" onChange={(v) => set('budget', v)} className="mt-2" />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {BUDGETS.map((b) => (
                    <Preset key={b} active={inputs.budget === b} onClick={() => set('budget', b)}>
                      € {b}
                    </Preset>
                  ))}
                </div>
              </>
            ) : (
              <NumberInput value={inputs.litres} step={5} suffix="litres" onChange={(v) => set('litres', v)} className="mt-2" />
            )}
          </Field>

          <Field label="Trip to the station" icon={<RouteIcon className="size-3.5" />}>
            <Toggle
              value={inputs.tripType}
              onChange={(v) => set('tripType', v)}
              options={[
                { id: 'round', label: 'There and back' },
                { id: 'oneway', label: 'One way only' },
              ]}
            />
            <p className="mt-1 text-[11px] text-muted">
              {inputs.tripType === 'round' ? 'You drive from the start point to the station and return.' : 'Counts only the way there — e.g. when the station is on your route.'}
            </p>
          </Field>

          <Field label="Start point" icon={<MapPin className="size-3.5" />}>
            <div className="flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{start ? startLabel : 'Not set'}</span>
              {customStart && (
                <button type="button" onClick={() => setCustomStart(null)} className="text-muted hover:text-fg" aria-label="Reset start point">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg border border-line py-1.5 text-xs font-medium hover:bg-sunken disabled:opacity-60"
            >
              {locating ? <Loader2 className="size-3.5 animate-spin" /> : <Crosshair className="size-3.5" />}
              Use my current location
            </button>
          </Field>

          <details className="group mt-3 rounded-lg border border-line px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted select-none group-open:mb-2">Optional: time & tank</summary>
            <Field label="Value of your time" icon={<Clock className="size-3.5" />} hint="Adds driving time as a cost. 0 = ignore time.">
              <NumberInput value={inputs.timeValue} step={1} suffix="€ / hour" onChange={(v) => set('timeValue', v)} />
            </Field>
            <Field label="Free space in tank" icon={<Droplets className="size-3.5" />} hint="Warns if the fill-up would not fit. Leave empty to skip.">
              <NumberInput value={inputs.freeTank ?? ''} step={1} suffix="litres" onChange={(v) => set('freeTank', v > 0 ? v : null)} />
            </Field>
          </details>
        </section>
      </aside>

      {/* ---------------- Results ---------------- */}
      <div className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold">
              <Scale className="size-4 text-accent" /> Stations to compare
              <span className="text-xs font-normal text-muted">
                {picked.length} / {MAX_COMPARE} · {fuelLabel}
              </span>
            </h3>
            {picked.length > 0 && (
              <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs text-muted hover:text-rose-500">
                <Trash2 className="size-3.5" /> Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {picked.map((s, i) => (
              <span key={s.id} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-line bg-sunken py-1 pr-1 pl-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="truncate">
                  {s.name}, {s.city}
                </span>
                <span className="font-mono text-xs text-muted">{s.prices[fuel]?.toFixed(3) ?? 'no price'}</span>
                <button type="button" onClick={() => onToggle(s.id)} className="rounded-md p-0.5 text-muted hover:bg-surface hover:text-fg" aria-label={`Remove ${s.name}`}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            {picked.length < MAX_COMPARE && addable.length > 0 && (
              <label className="relative inline-flex max-w-full min-w-0 items-center">
                <Plus className="pointer-events-none absolute left-2.5 size-3.5 text-accent" />
                <select
                  value=""
                  onChange={(e) => e.target.value && onToggle(Number(e.target.value))}
                  className="h-9 w-full max-w-full cursor-pointer truncate rounded-xl border border-dashed border-accent/50 bg-accent/5 pr-3 pl-7 text-sm font-medium text-accent"
                >
                  <option value="">Add a station…</option>
                  {addable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.prices[fuel]!.toFixed(3)} · {s.name}, {s.city}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {(unpriced.length > 0 || missing > 0) && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {unpriced.length > 0 && `${unpriced.map((s) => s.name).join(', ')} has no published ${fuelLabel} price and is skipped. `}
              {missing > 0 && `${missing} selected station(s) are not in the current search results.`}
            </p>
          )}
        </section>

        {priced.length < 2 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent/10 text-accent">
              <Scale className="size-6" />
            </span>
            <div>
              <p className="font-semibold">Pick at least two stations</p>
              <p className="mx-auto max-w-md text-sm text-muted">
                Use the <Scale className="inline size-3.5" /> button on any station card, table row or details panel — or the “Add a station” menu above. We will work out which one gives you the most fuel for your money once the drive is counted.
              </p>
            </div>
          </div>
        ) : !start ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            Set a start point (use your current location) to calculate the drive to each station.
          </div>
        ) : routes.isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface p-10 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Calculating driving routes…
          </div>
        ) : (
          verdict && (
            <>
              <VerdictBanner verdict={verdict} inputs={inputs} station={byId} />
              <div className={clsx('grid gap-3', options.length === 2 ? 'md:grid-cols-2' : options.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 2xl:grid-cols-4')}>
                {options.map((o, i) => (
                  <OptionCard
                    key={o.id}
                    option={o}
                    station={byId(o.id)}
                    color={COLORS[picked.findIndex((s) => s.id === o.id) % COLORS.length]}
                    isBest={o.id === verdict.best.id}
                    rank={[...options].sort((a, b) => (inputs.mode === 'budget' ? b.usableLitres - a.usableLitres : a.totalCost - b.totalCost)).findIndex((x) => x.id === o.id) + 1}
                    inputs={inputs}
                    best={verdict.best}
                    onSelect={onSelect}
                    index={i}
                  />
                ))}
              </div>
              <BreakdownChart options={options} station={byId} inputs={inputs} />
              <p className="flex items-start gap-1.5 text-[11px] text-muted">
                <Info className="mt-px size-3 shrink-0" />
                {options.every((o) => o.route.source === 'road')
                  ? 'Distances and times are real driving routes (OSRM / OpenStreetMap) from the start point.'
                  : 'Some routes could not be calculated and were estimated from straight-line distance × 1.3.'}{' '}
                The fuel burnt on the way is valued at each station’s own price. Prices can change at any time.
              </p>
            </>
          )
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function VerdictBanner({ verdict: v, inputs, station }: { verdict: NonNullable<ReturnType<typeof decide>>; inputs: CompareInputs; station: (id: number) => Station }) {
  // Chains often share a name ("Turmöl Quick"), so always include the town.
  const name = (id: number) => `${station(id).name} (${station(id).city})`
  const best = { name: name(v.best.id) }
  const runner = { name: name(v.runnerUp.id) }
  const cheap = { name: name(v.cheapestPrice.id) }
  const tiny = Math.abs(v.euroGain) < 0.1
  const priceDiffCt = (v.runnerUp.price - v.best.price) * 100
  const extraKm = v.best.drivenKm - v.runnerUp.drivenKm

  let headline: string
  let detail: ReactNode
  if (tiny) {
    headline = 'It makes practically no difference'
    detail = (
      <>
        Both options end up within {eur(Math.abs(v.euroGain))}. Pick whichever is more convenient — <b>{best.name}</b> is marginally better.
      </>
    )
  } else if (v.cheapestNotWorth) {
    headline = `Not worth the drive — fuel at ${best.name}`
    detail = (
      <>
        {cheap.name} is {((v.best.price - v.cheapestPrice.price) * 100).toFixed(1)} ct/L cheaper, but reaching it burns{' '}
        {lit(v.cheapestPrice.tripLitres - v.best.tripLitres)} more fuel than it saves. You come out {inputs.mode === 'budget' ? `${lit(v.litresGain)} ahead` : `${eur(v.euroGain)} ahead`} at {best.name}.
      </>
    )
  } else if (extraKm > 0.2) {
    headline = `Worth the drive — fuel at ${best.name}`
    detail = (
      <>
        It is {priceDiffCt.toFixed(1)} ct/L cheaper than {runner.name}. Even after driving {km(extraKm)} further, you{' '}
        {inputs.mode === 'budget' ? (
          <>
            get <b>{lit(v.litresGain)}</b> more usable fuel for your {eur(inputs.budget)} (worth about {eur(v.euroGain)}).
          </>
        ) : (
          <>
            save <b>{eur(v.euroGain)}</b> on {inputs.litres} L.
          </>
        )}
      </>
    )
  } else {
    headline = `Easy choice — fuel at ${best.name}`
    detail = (
      <>
        It is both cheaper{priceDiffCt > 0.05 ? ` (by ${priceDiffCt.toFixed(1)} ct/L)` : ''} and no further away than {runner.name}. You{' '}
        {inputs.mode === 'budget' ? (
          <>
            get <b>{lit(v.litresGain)}</b> more usable fuel (≈ {eur(v.euroGain)}).
          </>
        ) : (
          <>
            save <b>{eur(v.euroGain)}</b>.
          </>
        )}
      </>
    )
  }

  const good = !v.cheapestNotWorth
  return (
    <section className={clsx('relative overflow-hidden rounded-2xl p-5 text-white shadow-lg', good ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-600/20' : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-600/20')}>
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/20">
          {tiny ? <Scale className="size-6" /> : good ? <ThumbsUp className="size-6" /> : <ThumbsDown className="size-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-white/80 uppercase">Recommendation</p>
          <h3 className="text-xl leading-tight font-bold">{headline}</h3>
          <p className="mt-1.5 text-sm text-white/90">{detail}</p>
          {v.breakEvenExtraKm !== null && v.breakEvenExtraKm > 0 && (
            <p className="mt-3 rounded-lg bg-black/15 px-2.5 py-1.5 text-xs">
              <RouteIcon className="mr-1.5 -mt-0.5 inline size-3.5" />
              Break-even: driving to the cheaper station only pays off if it adds less than <b>{km(v.breakEvenExtraKm)}</b> of extra driving
              {inputs.tripType === 'round' ? ' (there and back combined)' : ''}.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function OptionCard({
  option: o,
  station: s,
  color,
  isBest,
  rank,
  inputs,
  best,
  onSelect,
}: {
  option: Option
  station: Station
  color: string
  isBest: boolean
  rank: number
  inputs: CompareInputs
  best: Option
  onSelect: (s: Station) => void
  index: number
}) {
  const vsBest = inputs.mode === 'budget' ? o.usableLitres - best.usableLitres : o.totalCost - best.totalCost
  return (
    <article className={clsx('relative overflow-hidden rounded-2xl border bg-surface shadow-sm', isBest ? 'border-emerald-500 ring-2 ring-emerald-500/25' : 'border-line')}>
      <div className="relative">
        <div className="relative h-24 overflow-hidden">
          <TileImage lat={s.lat} lon={s.lon} width={640} height={96} color={brandColor(s.brand)} className="absolute top-0 left-1/2 -translate-x-1/2" />
        </div>
        <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: color }} />
        {isBest ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow">
            <Trophy className="size-3.5" /> Best choice
          </span>
        ) : (
          <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">#{rank}</span>
        )}
      </div>

      <div className="space-y-3 p-4">
        <button type="button" onClick={() => onSelect(s)} className="block w-full text-left">
          <div className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: brandColor(s.brand) }}>
            {s.brand}
          </div>
          <div className="truncate font-semibold hover:text-accent">{s.name}</div>
          <div className="truncate text-xs text-muted">
            {s.address}, {s.city}
          </div>
        </button>

        <div className="flex items-end justify-between rounded-xl bg-sunken px-3 py-2">
          <div>
            <div className="text-[11px] text-muted">Pump price</div>
            <div className="font-mono text-xl font-bold tabular-nums">€ {o.price.toFixed(3)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted">Real cost per usable litre</div>
            <div className={clsx('font-mono text-base font-semibold tabular-nums', isBest && 'text-emerald-600 dark:text-emerald-400')}>
              {Number.isFinite(o.effectivePerLitre) ? `€ ${o.effectivePerLitre.toFixed(3)}` : '—'}
            </div>
          </div>
        </div>

        <dl className="space-y-1.5 text-sm">
          <Row icon={<Navigation className="size-3.5" />} label={`Drive (${inputs.tripType === 'round' ? 'there and back' : 'one way'})`} value={`${km(o.drivenKm)} · ${min(o.driveMinutes)}`} />
          <Row icon={<Droplets className="size-3.5" />} label="Fuel used to get there" value={`${lit(o.tripLitres)} (${eur(o.tripFuelCost)})`} tone="bad" />
          {o.timeCost > 0 && <Row icon={<Clock className="size-3.5" />} label="Time cost" value={eur(o.timeCost)} tone="bad" />}
          <Row icon={<Euro className="size-3.5" />} label="You pay at the pump" value={eur(o.spend)} />
          <Row icon={<Droplets className="size-3.5" />} label="Litres you get" value={lit(o.litresBought)} />
          <div className="my-1 h-px bg-line" />
          {inputs.mode === 'budget' ? (
            <Row icon={<BadgeCheck className="size-3.5" />} label="Usable fuel after the drive" value={lit(o.usableLitres)} strong />
          ) : (
            <Row icon={<BadgeCheck className="size-3.5" />} label="Total cost incl. drive" value={eur(o.totalCost)} strong />
          )}
        </dl>

        {!isBest && (
          <p className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400">
            {inputs.mode === 'budget' ? `${lit(Math.abs(vsBest))} less usable fuel than the best choice` : `${eur(Math.abs(vsBest))} more than the best choice`}
          </p>
        )}
        {o.usableLitres <= 0 && (
          <p className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400">
            <AlertTriangle className="size-3.5" /> The drive uses more fuel than you would buy.
          </p>
        )}
        {o.exceedsTank && (
          <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5" /> {lit(o.litresBought)} will not fit into {inputs.freeTank} L of free tank space.
          </p>
        )}
        {o.route.source === 'estimate' && <p className="text-[11px] text-muted">Distance estimated (routing unavailable).</p>}
      </div>
    </article>
  )
}

function BreakdownChart({ options, station, inputs }: { options: Option[]; station: (id: number) => Station; inputs: CompareInputs }) {
  const data = options.map((o) => ({
    name: station(o.id).name.length > 20 ? `${station(o.id).name.slice(0, 19)}…` : station(o.id).name,
    full: `${station(o.id).name}, ${station(o.id).city}`,
    usable: +Math.max(0, o.usableLitres).toFixed(2),
    trip: +o.tripLitres.toFixed(2),
    pump: +o.spend.toFixed(2),
    tripCost: +o.tripFuelCost.toFixed(2),
    time: +o.timeCost.toFixed(2),
  }))
  const tick = { fill: 'var(--color-muted)', fontSize: 11 }
  const budget = inputs.mode === 'budget'
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <h3 className="font-semibold">{budget ? `Where your € ${inputs.budget} goes` : `What ${inputs.litres} L really costs`}</h3>
      <p className="mb-3 text-xs text-muted">{budget ? 'Litres bought, split into fuel burnt on the drive and fuel left for you' : 'Pump price plus the fuel (and time) spent reaching the station'}</p>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 56 + 50)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48 }} barCategoryGap={12}>
          <CartesianGrid horizontal={false} stroke="var(--color-line)" strokeDasharray="3 3" />
          <XAxis type="number" tick={tick} axisLine={{ stroke: 'var(--color-line)' }} tickLine={false} tickFormatter={(v: number) => (budget ? `${v} L` : `€${v}`)} />
          <YAxis type="category" dataKey="name" width={140} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--color-sunken)', fillOpacity: 0.7 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof data)[number]
              return (
                <div className="min-w-52 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg shadow-xl">
                  <div className="mb-1 font-semibold">{d.full}</div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="flex justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="size-2 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </span>
                      <span className="font-mono">{budget ? `${Number(p.value).toFixed(2)} L` : `€ ${Number(p.value).toFixed(2)}`}</span>
                    </div>
                  ))}
                </div>
              )
            }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-fg">{v}</span>} />
          {budget ? (
            <>
              <Bar dataKey="usable" name="Usable fuel" stackId="a" fill="#10b981" radius={[4, 0, 0, 4]}>
                <LabelList dataKey="usable" position="insideRight" formatter={(v) => `${Number(v).toFixed(1)} L`} style={{ fill: '#fff', fontSize: 11, fontWeight: 600 }} />
              </Bar>
              <Bar dataKey="trip" name="Burnt on the drive" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} />
            </>
          ) : (
            <>
              <Bar dataKey="pump" name="At the pump" stackId="a" fill="#6366f1" />
              <Bar dataKey="tripCost" name="Fuel for the drive" stackId="a" fill="#f43f5e" />
              {data.some((d) => d.time > 0) && <Bar dataKey="time" name="Your time" stackId="a" fill="#f59e0b" />}
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Small form primitives

function Field({ label, icon, hint, children }: { label: string; icon: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

function NumberInput({ value, onChange, suffix, step, className }: { value: number | ''; onChange: (v: number) => void; suffix: string; step: number; className?: string }) {
  return (
    <label className={clsx('flex items-center rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20', className)}>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="w-full bg-transparent px-3 py-2 font-mono text-sm outline-none"
      />
      <span className="pr-3 text-xs whitespace-nowrap text-muted">{suffix}</span>
    </label>
  )
}

function Preset({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors', active ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}
    >
      {children}
    </button>
  )
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx('rounded-md px-2 py-1.5 text-xs font-medium transition-colors', value === o.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ icon, label, value, tone, strong }: { icon: ReactNode; label: string; value: string; tone?: 'bad'; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-muted">
        {icon}
        {label}
      </dt>
      <dd className={clsx('font-mono tabular-nums', strong && 'text-base font-bold', tone === 'bad' && 'text-rose-500')}>{value}</dd>
    </div>
  )
}
