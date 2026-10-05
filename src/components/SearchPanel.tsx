import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SCAN_MODES } from '../lib/geo'
import { geocode, reverseGeocode } from '../lib/geocode'
import { useRegions, type SearchTarget } from '../hooks/useStations'
import { Segmented, Switch } from './ui'

export function SearchPanel({
  target,
  onChange,
  includeClosed,
  onIncludeClosed,
}: {
  target: SearchTarget
  onChange: (t: SearchTarget) => void
  includeClosed: boolean
  onIncludeClosed: (v: boolean) => void
}) {
  const [mode, setMode] = useState<'location' | 'region'>(target.kind)
  return (
    <div className="space-y-3">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { id: 'location', label: 'By location' },
          { id: 'region', label: 'By region' },
        ]}
      />
      {mode === 'location' ? <LocationSearch target={target} onChange={onChange} /> : <RegionSearch target={target} onChange={onChange} />}
      <Switch
        checked={includeClosed}
        onChange={onIncludeClosed}
        label="Include closed stations"
        hint="Ask the API for stations that are closed right now"
      />
    </div>
  )
}

function LocationSearch({ target, onChange }: { target: SearchTarget; onChange: (t: SearchTarget) => void }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const scan = target.kind === 'location' ? target.scan : 'single'

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 400)
    return () => clearTimeout(t)
  }, [q])

  const places = useQuery({
    queryKey: ['geocode', debounced],
    queryFn: ({ signal }) => geocode(debounced, signal),
    enabled: debounced.length >= 3,
    staleTime: Infinity,
  })

  const locate = () => {
    if (!navigator.geolocation) return setGeoError('Geolocation not supported')
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const center = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        const label = await reverseGeocode(center.lat, center.lon)
        onChange({ kind: 'location', center, label: `Near ${label}`, scan })
        setLocating(false)
      },
      (err) => {
        setGeoError(err.message)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="City, address or postcode…"
          className="w-full rounded-lg border border-line bg-surface py-2 pr-9 pl-8 text-sm outline-none focus:border-accent"
        />
        {places.isFetching && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted" />}
        {debounced.length >= 3 && places.data && q && (
          <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg">
            {places.data.length === 0 && <li className="px-3 py-2 text-sm text-muted">No places found</li>}
            {places.data.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-sunken"
                  onClick={() => {
                    onChange({ kind: 'location', center: { lat: p.lat, lon: p.lon }, label: p.label.split(',')[0], scan })
                    setQ('')
                  }}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                  <span className="line-clamp-2">{p.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={locate}
        disabled={locating}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-line py-2 text-sm font-medium hover:bg-sunken disabled:opacity-60"
      >
        {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
        Use my location
      </button>
      {geoError && <p className="text-xs text-red-500">{geoError}</p>}
      <p className="text-xs text-muted">Tip: click anywhere on the map to search there.</p>

      <div>
        <span className="mb-1.5 block text-xs text-muted">Search area</span>
        <div className="grid grid-cols-3 gap-1.5">
          {SCAN_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={target.kind !== 'location'}
              onClick={() => target.kind === 'location' && onChange({ ...target, scan: m.id })}
              className={clsx(
                'rounded-lg border px-2 py-1.5 text-left text-xs disabled:opacity-50',
                scan === m.id ? 'border-accent bg-accent/10' : 'border-line hover:bg-sunken',
              )}
            >
              <span className="block font-semibold">{m.label}</span>
              <span className="block text-[10px] leading-tight text-muted">{m.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function RegionSearch({ target, onChange }: { target: SearchTarget; onChange: (t: SearchTarget) => void }) {
  const regions = useRegions()
  const [state, setState] = useState<number | ''>(() =>
    target.kind === 'region' ? (target.type === 'BL' ? target.code : Math.floor(target.code / 100)) : '',
  )
  const selectedState = regions.data?.find((r) => r.code === state)

  if (regions.isLoading) return <p className="text-sm text-muted">Loading regions…</p>
  if (regions.error) return <p className="text-sm text-red-500">Could not load regions</p>

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Federal state (Bundesland)</span>
        <select
          value={state}
          onChange={(e) => {
            const code = Number(e.target.value)
            setState(code)
            const r = regions.data!.find((x) => x.code === code)!
            onChange({ kind: 'region', code, type: 'BL', label: r.name })
          }}
          className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm"
        >
          <option value="" disabled>
            Choose a state…
          </option>
          {regions.data?.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {selectedState && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">District (Bezirk)</span>
          <select
            value={target.kind === 'region' && target.type === 'PB' ? target.code : ''}
            onChange={(e) => {
              const code = Number(e.target.value)
              if (!code) return onChange({ kind: 'region', code: selectedState.code, type: 'BL', label: selectedState.name })
              const d = selectedState.subRegions.find((x) => x.code === code)!
              onChange({ kind: 'region', code, type: 'PB', label: `${d.name}, ${selectedState.name}` })
            }}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm"
          >
            <option value="">Whole state</option>
            {selectedState.subRegions.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-xs text-muted">Region search returns the cheapest stations in the area.</p>
    </div>
  )
}
