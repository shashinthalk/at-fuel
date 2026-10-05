import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LocateFixed, MousePointerClick } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { brandColor } from '../lib/brand'
import { priceRank, rankColor } from '../lib/filters'
import type { LatLon } from '../lib/geo'
import { fmtKm, type Station } from '../lib/station'
import { TileImage } from './LocationImage'
import type { ListProps } from './StationList'

const STAR_SVG =
  '<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true"><polygon points="12,2 15.1,8.9 22.5,9.6 16.9,14.6 18.6,22 12,18.1 5.4,22 7.1,14.6 1.5,9.6 8.9,8.9"/></svg>'

function priceIcon(label: string, color: string, state: 'normal' | 'hover' | 'selected', fav: boolean) {
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div class="price-pin is-${state}" style="--pin:${color}">${fav ? STAR_SVG : ''}<span>${label}</span></div>`,
  })
}

const centerIcon = L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="center-pin"></div>' })

function boundsOf(stations: Station[], center: LatLon | null) {
  const pts: [number, number][] = stations.map((s) => [s.lat, s.lon])
  if (center) pts.push([center.lat, center.lon])
  return pts.length ? L.latLngBounds(pts) : null
}

function FitBounds({ stations, center }: { stations: Station[]; center: LatLon | null }) {
  const map = useMap()
  const key = stations.map((s) => s.id).join(',')
  useEffect(() => {
    const b = boundsOf(stations, center)
    if (b) map.fitBounds(b, { padding: [48, 48], maxZoom: 14 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, center?.lat, center?.lon])
  return null
}

function FlyToSelected({ station }: { station: Station | undefined }) {
  const map = useMap()
  useEffect(() => {
    if (station) map.flyTo([station.lat, station.lon], Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [station, map])
  return null
}

function ClickToSearch({ onPick }: { onPick: (p: LatLon) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) })
  return null
}

function RecenterButton({ stations, center }: { stations: Station[]; center: LatLon | null }) {
  const map = useMap()
  return (
    <button
      type="button"
      title="Fit all results"
      aria-label="Fit all results"
      onClick={(e) => {
        e.stopPropagation()
        const b = boundsOf(stations, center)
        if (b) map.flyToBounds(b, { padding: [48, 48], maxZoom: 14, duration: 0.6 })
      }}
      className="absolute top-20 left-2.5 z-[500] grid size-[34px] place-items-center rounded-md border-2 border-black/20 bg-surface text-fg hover:bg-sunken"
    >
      <LocateFixed className="size-4" />
    </button>
  )
}

export function MapView({
  center,
  onPick,
  height = 'h-[560px]',
  ...p
}: ListProps & { center: LatLon | null; onPick: (pt: LatLon) => void; height?: string }) {
  const selected = useMemo(() => p.stations.find((s) => s.id === p.selectedId), [p.stations, p.selectedId])
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line shadow-sm ${height}`}>
      <MapContainer center={center ? [center.lat, center.lon] : [47.6, 13.8]} zoom={11} className="size-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds stations={p.stations} center={center} />
        <FlyToSelected station={selected} />
        <ClickToSearch onPick={onPick} />
        <RecenterButton stations={p.stations} center={center} />
        {center && (
          <>
            <Marker position={[center.lat, center.lon]} icon={centerIcon} zIndexOffset={-1000}>
              <Tooltip direction="top" offset={[0, -10]}>
                Search centre
              </Tooltip>
            </Marker>
            {p.showDistance && p.stations.length > 0 && (
              <Circle
                center={[center.lat, center.lon]}
                radius={Math.max(...p.stations.map((s) => s.distance)) * 1000}
                pathOptions={{ color: '#6366f1', weight: 1, fillOpacity: 0.04, dashArray: '4 4' }}
              />
            )}
          </>
        )}
        {p.stations.map((s) => {
          const price = s.prices[p.fuel]
          const color = rankColor(priceRank(price, p.min, p.max))
          const state = s.id === p.selectedId ? 'selected' : s.id === p.hoveredId ? 'hover' : 'normal'
          const z = state !== 'normal' ? 5000 : price !== undefined ? 1000 - Math.round((price - p.min) * 1000) : 0
          return (
            <Marker
              key={s.id}
              position={[s.lat, s.lon]}
              zIndexOffset={z}
              icon={priceIcon(price !== undefined ? price.toFixed(3) : '', color, state, p.favorites.has(s.id))}
              eventHandlers={{
                click: () => p.onSelect(s),
                mouseover: () => p.onHover(s.id),
                mouseout: () => p.onHover(null),
              }}
            >
              <Tooltip direction="top" offset={[0, -26]} className="station-tooltip" opacity={1}>
                <div className="w-56 overflow-hidden rounded-xl">
                  <TileImage lat={s.lat} lon={s.lon} width={224} height={110} color={brandColor(s.brand)} />
                  <div className="space-y-0.5 p-2.5">
                    <div className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: brandColor(s.brand) }}>
                      {s.brand}
                    </div>
                    <div className="truncate text-[13px] font-semibold">{s.name}</div>
                    <div className="truncate text-[11px] text-muted">
                      {s.address}, {s.city}
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="font-mono text-base font-bold" style={{ color }}>
                        {price !== undefined ? `€ ${price.toFixed(3)}` : 'No price'}
                      </span>
                      {p.showDistance && <span className="text-[11px] text-muted">{fmtKm(s.distance)}</span>}
                    </div>
                  </div>
                </div>
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>

      <div className="pointer-events-none absolute top-3 left-1/2 z-[500] hidden -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1 text-xs text-muted shadow backdrop-blur sm:flex">
        <MousePointerClick className="size-3.5" />
        Click the map to search there
      </div>
      <div className="pointer-events-none absolute right-3 bottom-6 z-[500] rounded-xl bg-surface/90 px-3 py-2 text-xs shadow backdrop-blur">
        <div className="mb-1 font-medium">Price per litre</div>
        <div className="h-2 w-32 rounded-full" style={{ background: `linear-gradient(90deg, ${rankColor(0)}, ${rankColor(0.5)}, ${rankColor(1)})` }} />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>{p.min ? p.min.toFixed(3) : '—'}</span>
          <span>{p.max ? p.max.toFixed(3) : '—'}</span>
        </div>
      </div>
    </div>
  )
}
