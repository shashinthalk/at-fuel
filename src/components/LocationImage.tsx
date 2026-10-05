import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Camera, Map as MapIcon, Satellite } from 'lucide-react'
import { useState } from 'react'
import { fetchStreetPhotos, MAPILLARY_TOKEN, tileUrl, tilesFor, type ImageryKind } from '../lib/imagery'

/** A static aerial/map picture centred on a coordinate, built from map tiles. */
export function TileImage({
  lat,
  lon,
  kind = 'satellite',
  zoom = 18,
  width,
  height,
  color = 'var(--color-accent)',
  className,
  lazy = false,
  compact = false,
}: {
  lat: number
  lon: number
  kind?: ImageryKind
  zoom?: number
  width: number
  height: number
  color?: string
  className?: string
  /** Defer tile loading until scrolled into view. */
  lazy?: boolean
  /** Small thumbnail: smaller marker, no attribution text. */
  compact?: boolean
}) {
  const [loaded, setLoaded] = useState(0)
  const tiles = tilesFor(lat, lon, zoom, width, height)
  return (
    <div className={clsx('relative overflow-hidden bg-sunken', className)} style={{ width, height }}>
      {loaded < tiles.length && <div className="absolute inset-0 animate-pulse bg-sunken" />}
      {tiles.map((t) => (
        <img
          key={`${t.x}-${t.y}`}
          src={tileUrl(kind, zoom, t.x, t.y)}
          alt=""
          draggable={false}
          loading={lazy ? 'lazy' : undefined}
          onLoad={() => setLoaded((n) => n + 1)}
          className="absolute max-w-none select-none"
          style={{ left: t.left, top: t.top, width: 256, height: 256 }}
        />
      ))}
      {/* Station marker */}
      <span
        className={clsx(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-white shadow-[0_0_0_3px_rgb(0_0_0/0.25)]',
          compact ? 'size-2.5 border-2' : 'size-4 border-[3px]',
        )}
        style={{ background: color }}
      />
      {!compact && (
        <span className="absolute right-1 bottom-1 rounded bg-black/50 px-1 text-[9px] text-white/90">
          {kind === 'satellite' ? 'Imagery © Esri' : '© OpenStreetMap'}
        </span>
      )}
    </div>
  )
}

export function useStreetPhotos(lat: number, lon: number, enabled = true) {
  return useQuery({
    queryKey: ['mapillary', lat.toFixed(5), lon.toFixed(5)],
    queryFn: ({ signal }) => fetchStreetPhotos(lat, lon, 4, signal),
    enabled: enabled && !!MAPILLARY_TOKEN,
    staleTime: Infinity,
  })
}

type Tab = 'satellite' | 'street' | 'map'

/** Tabbed gallery used in the station details panel; fills its container's width. */
export function LocationGallery({ lat, lon, color, height }: { lat: number; lon: number; color: string; height: number }) {
  const width = 720 // rendered wider than needed and centred, so it covers any panel width
  const photos = useStreetPhotos(lat, lon)
  const hasStreet = !!photos.data?.length
  const [tab, setTab] = useState<Tab>('satellite')
  const [photoIdx, setPhotoIdx] = useState(0)
  const active = tab === 'street' && !hasStreet ? 'satellite' : tab

  const tabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'satellite', label: 'Aerial', icon: <Satellite className="size-3.5" />, show: true },
    { id: 'street', label: 'Street', icon: <Camera className="size-3.5" />, show: hasStreet },
    { id: 'map', label: 'Map', icon: <MapIcon className="size-3.5" />, show: true },
  ]

  return (
    <div className="relative w-full shrink-0 overflow-hidden" style={{ height }}>
      {active === 'street' && photos.data ? (
        <div className="relative size-full bg-black">
          <img src={photos.data[photoIdx].url} alt="Street-level view near the station" className="size-full object-cover" />
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.data.map((p, i) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Photo ${i + 1}`}
                onClick={() => setPhotoIdx(i)}
                className={clsx('size-2 rounded-full', i === photoIdx ? 'bg-white' : 'bg-white/40')}
              />
            ))}
          </div>
          <span className="absolute right-1 bottom-1 rounded bg-black/50 px-1 text-[9px] text-white/90">© Mapillary</span>
        </div>
      ) : (
        <TileImage
          key={active}
          lat={lat}
          lon={lon}
          kind={active === 'map' ? 'map' : 'satellite'}
          zoom={active === 'map' ? 17 : 18}
          width={width}
          height={height}
          color={color}
          className="absolute top-0 left-1/2 -translate-x-1/2"
        />
      )}
      <div className="absolute top-2 left-2 flex gap-1 rounded-lg bg-black/45 p-0.5 backdrop-blur">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                active === t.id ? 'bg-white text-slate-900' : 'text-white/85 hover:text-white',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
      </div>
    </div>
  )
}
