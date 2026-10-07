import clsx from 'clsx'
import { Clock, CreditCard, Globe, Mail, Navigation, Phone, Scale, Star, X } from 'lucide-react'
import { useEffect } from 'react'
import { useMedia } from '../hooks/useMedia'
import { FUEL_TYPES, type FuelType } from '../api/econtrol'
import { brandColor } from '../lib/brand'
import { effectiveCost, type TripSettings } from '../lib/filters'
import { DAY_LABELS_EN, viennaNow } from '../lib/hours'
import { fmtKm, type Station } from '../lib/station'
import { LocationGallery } from './LocationImage'
import { useDragToClose, useScrollLock } from '../hooks/useSheet'
import { GrabHandle } from './mobile'
import { StationHistory } from './StationHistory'

export function StationDrawer({
  station,
  fuel,
  trip,
  avg,
  isFav,
  onToggleFav,
  onClose,
  showDistance,
  historyStamp,
  inCompare,
  compareFull,
  onToggleCompare,
}: {
  station: Station
  fuel: FuelType
  trip: TripSettings
  avg: number | undefined
  isFav: boolean
  onToggleFav: () => void
  onClose: () => void
  showDistance: boolean
  historyStamp: number
  inCompare: boolean
  compareFull: boolean
  onToggleCompare: () => void
}) {
  const s = station
  const r = s.raw
  const today = viennaNow().day

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const price = s.prices[fuel]
  const eff = effectiveCost(price, s.distance, trip)
  // Phones: bottom sheet (drag the handle down to close). From 640px: side drawer.
  const phone = useMedia('(max-width: 639px)')
  const { ref, handle } = useDragToClose<HTMLElement>(onClose)
  useScrollLock()
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-stretch sm:justify-end" role="dialog" aria-modal>
      <div className="fade-in absolute inset-0 bg-black/45 backdrop-blur-[2px] sm:bg-black/40 sm:backdrop-blur-[1px]" onClick={onClose} />
      <aside
        ref={ref}
        className="drawer-in relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none"
      >
        <GrabHandle handle={handle} className="absolute inset-x-0 top-0 z-30 h-7 sm:hidden [&>span]:bg-white/80 [&>span]:shadow" />
        <div className="flex-1 overflow-y-auto overscroll-contain">
        <LocationGallery lat={s.lat} lon={s.lon} color={brandColor(s.brand)} height={phone ? 170 : 210} />
        <header className="sticky top-0 z-10 border-b border-line bg-surface/95 p-4 backdrop-blur" style={{ borderTop: `3px solid ${brandColor(s.brand)}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold" style={{ color: brandColor(s.brand) }}>
                {s.brand}
              </div>
              <h2 className="text-lg leading-tight font-bold">{s.name}</h2>
              <p className="text-sm text-muted">
                {s.address}, {s.postalCode} {s.city}
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onToggleCompare}
                disabled={!inCompare && compareFull}
                title={inCompare ? 'Remove from comparison' : compareFull ? 'Comparison is full (4 stations)' : 'Add to comparison'}
                aria-label={inCompare ? 'Remove from comparison' : 'Add to comparison'}
                aria-pressed={inCompare}
                className={clsx('rounded-full p-2 active:scale-90 disabled:opacity-30 sm:rounded-lg', inCompare ? 'bg-accent text-white' : 'bg-sunken sm:bg-transparent sm:hover:bg-sunken')}
              >
                <Scale className="size-5" />
              </button>
              <button type="button" onClick={onToggleFav} className="rounded-full bg-sunken p-2 active:scale-90 sm:rounded-lg sm:bg-transparent sm:hover:bg-sunken" aria-label="Toggle favourite">
                <Star className={clsx('size-5', isFav && 'fill-amber-400 text-amber-400')} />
              </button>
              <button type="button" onClick={onClose} className="rounded-full bg-sunken p-2 active:scale-90 sm:rounded-lg sm:bg-transparent sm:hover:bg-sunken" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-5 p-4">
          <div className="grid grid-cols-3 gap-2">
            {FUEL_TYPES.map((f) => {
              const v = s.prices[f.id]
              return (
                <div key={f.id} className={clsx('rounded-lg border p-2.5 text-center', f.id === fuel ? 'border-accent bg-accent/5' : 'border-line')}>
                  <div className="text-xs text-muted">{f.short}</div>
                  <div className="font-mono text-lg font-bold tabular-nums">{v?.toFixed(3) ?? '—'}</div>
                  <div className="text-[10px] text-muted">{v !== undefined ? '€/L' : s.queried.has(f.id) ? 'not in top 5' : 'not offered'}</div>
                </div>
              )
            })}
          </div>

          {price !== undefined && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label={`${trip.tankLitres} L fill-up`} value={`€ ${(price * trip.tankLitres).toFixed(2)}`} />
              {showDistance && <Info label="Incl. round trip" value={eff !== undefined ? `€ ${eff.toFixed(2)}` : '—'} />}
              {avg !== undefined && (
                <Info
                  label="vs. average"
                  value={`${price <= avg ? '−' : '+'}${Math.abs((price - avg) * 100).toFixed(1)} ct/L`}
                  tone={price <= avg ? 'good' : 'bad'}
                />
              )}
              {showDistance && <Info label="Distance" value={fmtKm(s.distance)} />}
            </div>
          )}

          <div className="hidden gap-2 sm:flex">
            <a
              href={navUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Navigation className="size-4" /> Navigate
            </a>
            <a
              href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=17/${s.lat}/${s.lon}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center rounded-lg border border-line px-3 text-sm hover:bg-sunken"
            >
              OSM
            </a>
          </div>

          <Block title="Price history">
            <StationHistory stationId={s.id} fuel={fuel} stamp={historyStamp} />
          </Block>

          <Block title="Opening hours" icon={<Clock className="size-4" />}>
            <p className={clsx('mb-2 text-sm font-medium', s.openNow === false ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>{s.openLabel}</p>
            <table className="w-full text-sm">
              <tbody>
                {r.openingHours?.map((h) => (
                  <tr key={`${h.day}-${h.from}`} className={clsx(h.day === today && 'font-semibold text-accent')}>
                    <td className="py-0.5">{DAY_LABELS_EN[h.day] ?? h.label}</td>
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {h.from === '00:00' && h.to === '24:00' ? '24 h' : `${h.from} – ${h.to}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>

          <Block title="Service & payment" icon={<CreditCard className="size-4" />}>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Flag on={r.offerInformation?.service}>Attended service</Flag>
              <Flag on={r.offerInformation?.selfService}>Self-service</Flag>
              <Flag on={r.offerInformation?.unattended}>Unattended</Flag>
              <Flag on={r.paymentMethods?.cash}>Cash</Flag>
              <Flag on={r.paymentMethods?.debitCard}>Debit card</Flag>
              <Flag on={r.paymentMethods?.creditCard}>Credit card</Flag>
              <Flag on={r.paymentArrangements?.clubCard}>Club card{r.paymentArrangements?.clubCardText ? `: ${r.paymentArrangements.clubCardText}` : ''}</Flag>
              <Flag on={r.paymentArrangements?.cooperative}>Cooperative</Flag>
            </div>
            {r.paymentMethods?.others && <p className="mt-2 text-xs text-muted">Also accepted: {r.paymentMethods.others}</p>}
            {r.paymentArrangements?.accessMod && <p className="mt-1 text-xs text-muted">Access: {r.paymentArrangements.accessMod}</p>}
            {r.otherServiceOffers && <p className="mt-1 text-xs text-muted">Other services: {r.otherServiceOffers}</p>}
          </Block>

          {r.contact && (
            <Block title="Contact">
              <ul className="space-y-1 text-sm">
                {r.contact.telephone && (
                  <li>
                    <a className="flex items-center gap-2 hover:text-accent" href={`tel:${r.contact.telephone}`}>
                      <Phone className="size-4" /> {r.contact.telephone}
                    </a>
                  </li>
                )}
                {r.contact.mail && (
                  <li>
                    <a className="flex items-center gap-2 hover:text-accent" href={`mailto:${r.contact.mail}`}>
                      <Mail className="size-4" /> {r.contact.mail}
                    </a>
                  </li>
                )}
                {r.contact.website && (
                  <li>
                    <a className="flex items-center gap-2 hover:text-accent" href={r.contact.website} target="_blank" rel="noreferrer">
                      <Globe className="size-4" /> {r.contact.website.replace(/^https?:\/\//, '')}
                    </a>
                  </li>
                )}
              </ul>
            </Block>
          )}
        </div>
        </div>

        {/* Phones: primary actions within thumb reach */}
        <div className="pb-safe flex gap-2 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur sm:hidden">
          <a
            href={navUrl}
            target="_blank"
            rel="noreferrer"
            className="mb-3 flex flex-1 items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-accent/25 active:scale-[0.98]"
          >
            <Navigation className="size-5" /> Navigate
          </a>
          {r.contact?.telephone && (
            <a
              href={`tel:${r.contact.telephone}`}
              aria-label="Call"
              className="mb-3 grid w-14 place-items-center rounded-2xl bg-sunken text-fg active:scale-95"
            >
              <Phone className="size-5" />
            </a>
          )}
        </div>
      </aside>
    </div>
  )
}

function Block({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function Info({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-sunken p-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={clsx('font-mono font-semibold tabular-nums', tone === 'good' && 'text-emerald-600 dark:text-emerald-400', tone === 'bad' && 'text-rose-500')}>{value}</div>
    </div>
  )
}

function Flag({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span className={clsx('rounded-md px-1.5 py-0.5', on ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-sunken text-muted line-through opacity-70')}>
      {children}
    </span>
  )
}
