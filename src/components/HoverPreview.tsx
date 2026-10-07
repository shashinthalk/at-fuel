import clsx from 'clsx'
import { Camera, Clock, MapPin } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FUEL_TYPES, type FuelType } from '../api/econtrol'
import { brandColor } from '../lib/brand'
import { fmtKm, type Station } from '../lib/station'
import { TileImage, useStreetPhotos } from './LocationImage'

const W = 300
const IMG_H = 150
const OPEN_DELAY = 220

/**
 * Wraps a trigger element; hovering it (or focusing it) shows a floating card
 * with an aerial picture of the station plus key facts.
 */
export function HoverPreview({
  station,
  fuel,
  showDistance,
  children,
  className,
}: {
  station: Station
  fuel: FuelType
  showDistance: boolean
  children: ReactNode
  className?: string
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const show = () => {
    // Touch screens fire mouseenter on tap; the details sheet opens instead.
    if (!window.matchMedia('(hover: hover)').matches) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => anchor.current && setRect(anchor.current.getBoundingClientRect()), OPEN_DELAY)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    setRect(null)
  }

  return (
    <span
      ref={anchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={clsx('inline-block', className)}
    >
      {children}
      {rect && createPortal(<PreviewCard station={station} fuel={fuel} showDistance={showDistance} anchor={rect} />, document.body)}
    </span>
  )
}

function PreviewCard({ station: s, fuel, showDistance, anchor }: { station: Station; fuel: FuelType; showDistance: boolean; anchor: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999, above: false })
  const photos = useStreetPhotos(s.lat, s.lon)
  const photo = photos.data?.[0]

  // Place below the anchor, or above when there is no room; keep inside the viewport.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 320
    const gap = 8
    const above = anchor.bottom + gap + h > window.innerHeight && anchor.top - gap - h > 0
    const top = above ? anchor.top - gap - h : anchor.bottom + gap
    const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - W / 2), window.innerWidth - W - 8)
    setPos({ left, top, above })
  }, [anchor])

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[3000] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl ring-1 ring-black/5 animate-in"
      style={{ left: pos.left, top: pos.top, width: W }}
    >
      <div className="relative">
        {photo ? (
          <img src={photo.url} alt="" className="h-[150px] w-full object-cover" />
        ) : (
          <TileImage lat={s.lat} lon={s.lon} width={W} height={IMG_H} color={brandColor(s.brand)} />
        )}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {photo ? <Camera className="size-3" /> : null}
          {photo ? 'Street view' : 'Aerial view'}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: brandColor(s.brand) }} />
      </div>
      <div className="space-y-2 p-3">
        <div>
          <div className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: brandColor(s.brand) }}>
            {s.brand}
          </div>
          <div className="leading-tight font-semibold">{s.name}</div>
          <div className="mt-0.5 flex items-start gap-1 text-xs text-muted">
            <MapPin className="mt-px size-3 shrink-0" />
            <span>
              {s.address}, {s.postalCode} {s.city}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {FUEL_TYPES.map((f) => (
            <div key={f.id} className={clsx('rounded-md px-1.5 py-1 text-center', f.id === fuel ? 'bg-accent/10 ring-1 ring-accent/40' : 'bg-sunken')}>
              <div className="text-[10px] text-muted">{f.short}</div>
              <div className="font-mono text-sm font-semibold tabular-nums">{s.prices[f.id]?.toFixed(3) ?? '—'}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={clsx('inline-flex items-center gap-1', s.openNow === false ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>
            <Clock className="size-3" />
            {s.openLabel}
          </span>
          {showDistance && <span className="text-muted">{fmtKm(s.distance)} away</span>}
        </div>
      </div>
    </div>
  )
}
