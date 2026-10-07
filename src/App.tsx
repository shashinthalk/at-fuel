import clsx from 'clsx'
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  BarChart3,
  Check,
  ChevronDown,
  Columns2,
  Download,
  Droplets,
  Flame,
  Fuel,
  History,
  LayoutGrid,
  Link2,
  List,
  Map as MapIcon,
  MapPin,
  Moon,
  Radar,
  RefreshCw,
  Rows3,
  Scale,
  SearchX,
  Share2,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FUEL_TYPES, type FuelType } from './api/econtrol'
import { FilterPanel } from './components/FilterPanel'
import { MapCarousel, MapView } from './components/MapView'
import { BottomSheet, TabBar } from './components/mobile'
import { SearchPanel } from './components/SearchPanel'
import { StationDrawer } from './components/StationDrawer'
import { StationList, type ListProps } from './components/StationList'
import { StationTable } from './components/StationTable'
import { StatsBar } from './components/StatsBar'
import { Segmented } from './components/ui'
import { useCompareList, useFavorites, useLocalStorage } from './hooks/useLocalStorage'
import { useIsMobile } from './hooks/useMedia'
import { DEFAULT_INPUTS, type CompareInputs } from './lib/compare'
import { useStations } from './hooks/useStations'
import { useUrlState } from './hooks/useUrlState'
import { exportCsv } from './lib/export'
import { applyFilters, countActive, DEFAULT_FILTERS, priceStats, type Filters, type SortKey, type TripSettings } from './lib/filters'
import { SCAN_MODES, type LatLon } from './lib/geo'
import { reverseGeocode } from './lib/geocode'

const Charts = lazy(() => import('./components/Charts').then((m) => ({ default: m.Charts })))
const CompareView = lazy(() => import('./components/CompareView').then((m) => ({ default: m.CompareView })))
const Trends = lazy(() => import('./components/Trends').then((m) => ({ default: m.Trends })))

type View = 'cards' | 'table' | 'split' | 'map' | 'charts' | 'trends' | 'compare'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'price', label: 'Price' },
  { id: 'effective', label: 'Trip cost' },
  { id: 'distance', label: 'Distance' },
  { id: 'name', label: 'Name' },
  { id: 'brand', label: 'Brand' },
]

const FUEL_ICONS: Record<FuelType, ReactNode> = {
  SUP: <Fuel className="size-4" />,
  DIE: <Droplets className="size-4" />,
  GAS: <Flame className="size-4" />,
}

export default function App() {
  const { filters, setFilters, target, setTarget } = useUrlState()
  const [includeClosed, setIncludeClosed] = useLocalStorage('fuel:includeClosed', false)
  const [trip, setTrip] = useLocalStorage<TripSettings>('fuel:trip', { tankLitres: 50, consumption: 6.5 })
  const [view, setView] = useLocalStorage<View>('fuel:view', 'split')
  const [dark, setDark] = useLocalStorage('fuel:dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [sidebar, setSidebar] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const { favorites, toggle: toggleFav } = useFavorites()
  const { compareIds, toggleCompare, clearCompare } = useCompareList()
  const [compareInputs, setCompareInputs] = useLocalStorage<CompareInputs>('fuel:compareInputs', { ...DEFAULT_INPUTS, consumption: trip.consumption })
  const isMobile = useIsMobile()
  // Phones get one list view; split and table layouts need a wide screen.
  const shown: View = isMobile && (view === 'split' || view === 'table') ? 'cards' : view
  const mobileMap = isMobile && shown === 'map'

  // Header height drives the sticky toolbar offset and the full-screen mobile map.
  const headerRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--hdr', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#121826' : '#ffffff'))
  }, [dark])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const { stations, isLoading, isFetching, progress, errors, queryCount, updatedAt, refetch } = useStations(target, includeClosed)

  const visible = useMemo(() => applyFilters(stations, filters, favorites, trip), [stations, filters, favorites, trip])
  const stats = useMemo(() => priceStats(visible, filters.fuel), [visible, filters.fuel])
  const cheapest = useMemo(
    () => visible.filter((s) => s.prices[filters.fuel] === stats?.min).sort((a, b) => a.distance - b.distance)[0],
    [visible, stats, filters.fuel],
  )
  // Cheapest price per fuel across the unfiltered results, shown in the fuel switcher.
  const fuelMins = useMemo(
    () => Object.fromEntries(FUEL_TYPES.map((f) => [f.id, priceStats(stations.filter((s) => s.queried.has(f.id)), f.id)?.min])) as Record<FuelType, number | undefined>,
    [stations],
  )
  const fuelTotal = useMemo(() => stations.filter((s) => s.queried.has(filters.fuel)).length, [stations, filters.fuel])
  const selected = stations.find((s) => s.id === selectedId)
  const center = target.kind === 'location' ? target.center : null
  const showDistance = target.kind === 'location'
  const activeFilters = countActive(filters)

  const onSort = (k: SortKey) => setFilters((f) => ({ ...f, sort: k, sortDir: f.sort === k && f.sortDir === 'asc' ? 'desc' : 'asc' }))
  const setFuel = (fuel: FuelType) => setFilters((f) => ({ ...f, fuel, maxPrice: null }))

  const onPick = useCallback(
    async (pt: LatLon) => {
      const scan = target.kind === 'location' ? target.scan : 'single'
      setTarget({ kind: 'location', center: pt, label: `${pt.lat.toFixed(3)}, ${pt.lon.toFixed(3)}`, scan })
      const label = await reverseGeocode(pt.lat, pt.lon)
      setTarget((t) => (t.kind === 'location' && t.center === pt ? { ...t, label } : t))
    },
    [target, setTarget],
  )

  const share = async () => {
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: `Fuel prices · ${target.label}`, url: location.href })
      } catch {
        /* dismissed */
      }
      return
    }
    try {
      await navigator.clipboard.writeText(location.href)
      setToast('Link copied — it includes your location and filters')
    } catch {
      setToast('Could not access the clipboard')
    }
  }

  const listProps: ListProps = {
    stations: visible,
    fuel: filters.fuel,
    min: stats?.min ?? 0,
    max: stats?.max ?? 0,
    avg: stats?.avg,
    trip,
    favorites,
    onToggleFav: toggleFav,
    compareIds,
    onToggleCompare: toggleCompare,
    onSelect: (s) => setSelectedId(s.id),
    selectedId,
    hoveredId,
    onHover: setHoveredId,
    showDistance,
  }

  const sidebarContent = (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-accent" /> Location
        </h2>
        <SearchPanel target={target} onChange={setTarget} includeClosed={includeClosed} onIncludeClosed={setIncludeClosed} />
      </section>
      <div className="h-px bg-line" />
      <FilterPanel
        stations={stations}
        filters={filters}
        setFilters={setFilters}
        trip={trip}
        setTrip={setTrip}
        favoriteCount={favorites.size}
        isRegion={target.kind === 'region'}
      />
    </div>
  )

  const scanMode = target.kind === 'location' ? SCAN_MODES.find((m) => m.id === target.scan) : undefined

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Header */}
      <header ref={headerRef} className="sticky top-0 z-[1100] border-b border-line bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:flex-none">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
              <Fuel className="size-5" />
            </div>
            <div className="hidden leading-tight lg:block">
              <h1 className="font-bold tracking-tight">Spritpreis Austria</h1>
              <p className="text-[11px] text-muted">Live fuel prices · E-Control</p>
            </div>
            {/* Phones: the location is the title; tap to search elsewhere. */}
            <button type="button" onClick={() => setSidebar(true)} className="min-w-0 flex-1 text-left leading-tight active:opacity-70 lg:hidden">
              <span className="flex items-center gap-1 text-[15px] font-semibold">
                <span className="truncate">{target.label}</span>
                <ChevronDown className="size-4 shrink-0 text-muted" />
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className={clsx('size-1.5 shrink-0 rounded-full', isFetching ? 'animate-pulse bg-amber-400' : 'bg-emerald-500')} />
                <span className="truncate">
                  {isFetching
                    ? `Updating ${Math.round(progress * 100)}%`
                    : `${target.kind === 'location' ? (scanMode?.label ?? 'Nearby') : 'Region'} · ${updatedAt ? new Date(updatedAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) : '—'}`}
                </span>
              </span>
            </button>
          </div>

          <nav aria-label="Fuel type" className="order-last flex w-full gap-1 rounded-xl bg-sunken p-1 lg:order-none lg:w-auto">
            {FUEL_TYPES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFuel(f.id)}
                aria-pressed={filters.fuel === f.id}
                className={clsx(
                  'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all active:scale-[0.97] lg:flex-none lg:justify-start lg:px-3',
                  filters.fuel === f.id ? 'bg-surface shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
                )}
              >
                <span className={clsx('shrink-0', filters.fuel === f.id && 'text-accent')}>{FUEL_ICONS[f.id]}</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-medium">
                    <span className="lg:hidden">{f.short}</span>
                    <span className="hidden lg:inline">{f.label}</span>
                  </span>
                  <span className="block font-mono text-[10px] text-muted tabular-nums">{fuelMins[f.id] !== undefined ? `from ${fuelMins[f.id]!.toFixed(3)}` : 'no data'}</span>
                </span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-0.5 lg:ml-auto lg:gap-1">
            <span className="mr-1 hidden items-center gap-1.5 text-xs text-muted md:flex">
              <span className={clsx('size-2 rounded-full', isFetching ? 'animate-pulse bg-amber-400' : 'bg-emerald-500')} />
              {isFetching
                ? `Updating ${Math.round(progress * 100)}%`
                : updatedAt
                  ? `Updated ${new Date(updatedAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
            </span>
            <IconBtn label="Refresh prices" onClick={refetch}>
              <RefreshCw className={clsx('size-4', isFetching && 'animate-spin')} />
            </IconBtn>
            <IconBtn label="Share" onClick={share}>
              {isMobile ? <Share2 className="size-4" /> : <Link2 className="size-4" />}
            </IconBtn>
            <IconBtn label={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark(!dark)}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </IconBtn>
          </div>
        </div>
        {isFetching && (
          <div className="h-0.5 bg-line">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300" style={{ width: `${Math.max(5, progress * 100)}%` }} />
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-[1680px] gap-5 px-4 pt-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:py-5">
        {/* Desktop sidebar */}
        <aside className="hidden w-[320px] shrink-0 lg:block">
          <div className="sticky top-[84px] max-h-[calc(100vh-100px)] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-sm">{sidebarContent}</div>
        </aside>

        {/* Phones & tablets: search and filters in a bottom sheet */}
        {sidebar && (
          <BottomSheet
            title="Search & filters"
            icon={<SlidersHorizontal className="size-4 text-accent" />}
            onClose={() => setSidebar(false)}
            footer={
              <button type="button" onClick={() => setSidebar(false)} className="w-full rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-accent/25 active:scale-[0.98]">
                Show {visible.length} station{visible.length === 1 ? '' : 's'}
              </button>
            }
          >
            {sidebarContent}
          </BottomSheet>
        )}

        <main className="min-w-0 flex-1 space-y-4">
          <div className="hidden flex-wrap items-end justify-between gap-3 lg:flex">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">{target.kind === 'location' ? 'Stations around' : 'Cheapest stations in'}</p>
              <h2 className="flex items-center gap-2 truncate text-2xl font-bold tracking-tight">
                <MapPin className="size-5 shrink-0 text-accent" />
                <span className="truncate">{target.label}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              {scanMode && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1">
                  <Radar className="size-3.5" /> {scanMode.label} search
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1">
                {queryCount} API {queryCount === 1 ? 'request' : 'requests'}
              </span>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {errors.length} of {queryCount} requests failed
                </p>
                <p className="text-xs opacity-80">{errors[0]}</p>
              </div>
              <button type="button" onClick={refetch} className="ml-auto rounded-md px-2 py-1 text-xs font-medium hover:bg-rose-500/10">
                Retry
              </button>
            </div>
          )}

          {isLoading && !stations.length ? (
            <Skeleton />
          ) : (
            <>
              {!mobileMap && <StatsBar stats={stats} cheapest={cheapest} total={fuelTotal} shown={visible.length} trip={trip} onSelect={(s) => setSelectedId(s.id)} />}

              {!mobileMap && (
              <div className="sticky top-[var(--hdr,62px)] z-[900] -mx-4 bg-bg/85 px-4 py-2 backdrop-blur-xl lg:-mx-1 lg:rounded-2xl lg:px-1">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSidebar(true)}
                    className={clsx(
                      'flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold active:scale-[0.97] lg:hidden',
                      activeFilters ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line bg-surface',
                    )}
                  >
                    <SlidersHorizontal className="size-4" />
                    Filters
                    {activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] text-white">{activeFilters}</span>}
                  </button>
                  <div className="hidden lg:block">
                  <Segmented
                    size="sm"
                    value={view}
                    onChange={setView}
                    options={[
                      { id: 'split', label: <Lbl icon={<Columns2 className="size-3.5" />} text="Split" />, title: 'Map and list' },
                      { id: 'cards', label: <Lbl icon={<LayoutGrid className="size-3.5" />} text="Cards" />, title: 'Cards' },
                      { id: 'table', label: <Lbl icon={<Rows3 className="size-3.5" />} text="Table" />, title: 'Table' },
                      { id: 'map', label: <Lbl icon={<MapIcon className="size-3.5" />} text="Map" />, title: 'Map' },
                      { id: 'charts', label: <Lbl icon={<BarChart3 className="size-3.5" />} text="Charts" />, title: 'Charts' },
                      { id: 'trends', label: <Lbl icon={<History className="size-3.5" />} text="History" />, title: 'Price history and trends' },
                      {
                        id: 'compare',
                        title: 'Where should I fuel up?',
                        label: (
                          <span className="inline-flex items-center gap-1.5">
                            <Scale className="size-3.5" />
                            <span className="hidden sm:inline">Compare</span>
                            {compareIds.length > 0 && <span className="grid size-4 place-items-center rounded-full bg-accent text-[10px] text-white">{compareIds.length}</span>}
                          </span>
                        ),
                      },
                    ]}
                  />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label="Sort by"
                      value={filters.sort}
                      onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
                      className="h-9 rounded-full border border-line bg-surface px-3 text-xs font-medium lg:h-8 lg:rounded-lg lg:px-2"
                    >
                      {SORTS.filter((s) => showDistance || (s.id !== 'distance' && s.id !== 'effective')).map((s) => (
                        <option key={s.id} value={s.id}>
                          Sort: {s.label}
                        </option>
                      ))}
                    </select>
                    <ToolBtn
                      label={filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}
                      onClick={() => setFilters((f) => ({ ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' }))}
                    >
                      {filters.sortDir === 'asc' ? <ArrowUpNarrowWide className="size-4" /> : <ArrowDownWideNarrow className="size-4" />}
                    </ToolBtn>
                    <span className="hidden lg:contents">
                      <ToolBtn label="Export CSV" onClick={() => exportCsv(visible)} disabled={!visible.length}>
                        <Download className="size-4" />
                      </ToolBtn>
                    </span>
                  </div>
                </div>
                <ActiveChips filters={filters} setFilters={setFilters} />
              </div>
              )}

              {visible.length === 0 && shown !== 'trends' && shown !== 'compare' ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface p-12 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-sunken text-muted">
                    <SearchX className="size-6" />
                  </span>
                  <div>
                    <p className="font-semibold">No stations match your filters</p>
                    <p className="text-sm text-muted">Try widening the price or distance range, or search a larger area.</p>
                  </div>
                  <button type="button" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white" onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, fuel: f.fuel }))}>
                    Clear all filters
                  </button>
                </div>
              ) : shown === 'cards' ? (
                <StationList {...listProps} />
              ) : shown === 'table' ? (
                <StationTable {...listProps} sort={filters.sort} sortDir={filters.sortDir} onSort={onSort} onFuel={setFuel} />
              ) : mobileMap ? (
                // Full-screen map between header and tab bar, with swipeable station cards.
                <div className="fixed inset-x-0 top-[var(--hdr,108px)] bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-[800]">
                  <MapView {...listProps} center={center} onPick={onPick} height="h-full" flat />
                  <button
                    type="button"
                    onClick={() => setSidebar(true)}
                    className="absolute top-3 right-3 z-[500] flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-semibold shadow-lg ring-1 ring-line active:scale-95"
                  >
                    <SlidersHorizontal className="size-4" />
                    Filters
                    {activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] text-white">{activeFilters}</span>}
                  </button>
                  <MapCarousel {...listProps} />
                </div>
              ) : shown === 'map' ? (
                <MapView {...listProps} center={center} onPick={onPick} height="h-[calc(100vh-20rem)] min-h-[480px]" />
              ) : shown === 'compare' ? (
                <Suspense fallback={<Skeleton />}>
                  <CompareView
                    allStations={stations}
                    candidates={[...visible].sort((a, b) => (a.prices[filters.fuel] ?? 99) - (b.prices[filters.fuel] ?? 99))}
                    compareIds={compareIds}
                    onToggle={toggleCompare}
                    onClear={clearCompare}
                    fuel={filters.fuel}
                    inputs={compareInputs}
                    setInputs={setCompareInputs}
                    defaultStart={center}
                    defaultStartLabel={target.label}
                    onSelect={(s) => setSelectedId(s.id)}
                  />
                </Suspense>
              ) : shown === 'trends' ? (
                <Suspense fallback={<Skeleton />}>
                  <Trends {...listProps} localStamp={updatedAt} />
                </Suspense>
              ) : shown === 'charts' ? (
                <Suspense fallback={<Skeleton />}>
                  <Charts {...listProps} />
                </Suspense>
              ) : (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(400px,1fr)]">
                  <div className="xl:sticky xl:top-[130px] xl:self-start">
                    <MapView {...listProps} center={center} onPick={onPick} height="h-[420px] xl:h-[calc(100vh-150px)]" />
                  </div>
                  <StationList {...listProps} compact />
                </div>
              )}
            </>
          )}

          <footer className="pt-6 pb-10 text-center text-xs leading-relaxed text-muted">
            Prices from the{' '}
            <a className="underline hover:text-fg" href="https://www.spritpreisrechner.at" target="_blank" rel="noreferrer">
              E-Control Spritpreisrechner
            </a>
            . By law only the cheapest stations publish prices, so others show “—”.
            <br />
            Map © OpenStreetMap contributors · Aerial imagery © Esri, Maxar, Earthstar Geographics
          </footer>
        </main>
      </div>

      <TabBar
        value={shown === 'split' || shown === 'table' ? 'cards' : shown}
        onChange={(v) => {
          setView(v)
          window.scrollTo({ top: 0 })
        }}
        tabs={[
          { id: 'cards', label: 'Stations', icon: <List className="size-5" /> },
          { id: 'map', label: 'Map', icon: <MapIcon className="size-5" /> },
          { id: 'charts', label: 'Insights', icon: <BarChart3 className="size-5" /> },
          { id: 'trends', label: 'History', icon: <History className="size-5" /> },
          { id: 'compare', label: 'Compare', icon: <Scale className="size-5" />, badge: compareIds.length },
        ]}
      />

      {compareIds.length > 0 && shown !== 'compare' && !mobileMap && (
        <div className="toast-in fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-[1050] flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-surface/95 p-2 pl-3 shadow-2xl backdrop-blur lg:bottom-6">
          <Scale className="size-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {compareIds.length} station{compareIds.length === 1 ? '' : 's'} to compare
            </p>
            <p className="truncate text-xs text-muted">
              {compareIds
                .map((id) => {
                  const s = stations.find((x) => x.id === id)
                  return s && `${s.name} (${s.city})`
                })
                .filter(Boolean)
                .join(' · ') || 'Selected stations'}
            </p>
          </div>
          <button type="button" onClick={clearCompare} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg" aria-label="Clear comparison" title="Clear">
            <X className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setView('compare')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            disabled={compareIds.length < 2}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold whitespace-nowrap text-white disabled:opacity-50"
          >
            {compareIds.length < 2 ? 'Pick one more' : 'Compare now'}
          </button>
        </div>
      )}

      {toast && (
        <div role="status" className="toast-in fixed top-[calc(var(--hdr,62px)+0.75rem)] left-1/2 z-[3000] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-fg px-4 py-2.5 text-sm text-bg shadow-xl">
          <Check className="size-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {selected && (
        <StationDrawer
          station={selected}
          fuel={filters.fuel}
          historyStamp={updatedAt}
          inCompare={compareIds.includes(selected.id)}
          compareFull={compareIds.length >= 4}
          onToggleCompare={() => toggleCompare(selected.id)}
          trip={trip}
          avg={stats?.avg}
          isFav={favorites.has(selected.id)}
          onToggleFav={() => toggleFav(selected.id)}
          onClose={() => setSelectedId(null)}
          showDistance={showDistance}
        />
      )}
    </div>
  )
}

const SERVICE_LABELS: Record<string, string> = { service: 'Attended service', selfService: 'Self-service', unattended: 'Unattended' }
const PAYMENT_LABELS: Record<string, string> = { cash: 'Cash', debitCard: 'Debit card', creditCard: 'Credit card' }

function ActiveChips({ filters, setFilters }: { filters: Filters; setFilters: (fn: (f: Filters) => Filters) => void }) {
  const chips: { label: string; clear: (f: Filters) => Filters }[] = []
  if (filters.query) chips.push({ label: `Text: ${filters.query}`, clear: (f) => ({ ...f, query: '' }) })
  if (filters.maxPrice !== null) chips.push({ label: `Max € ${filters.maxPrice.toFixed(3)}`, clear: (f) => ({ ...f, maxPrice: null }) })
  if (filters.maxDistance !== null) chips.push({ label: `Within ${filters.maxDistance} km`, clear: (f) => ({ ...f, maxDistance: null }) })
  filters.brands.forEach((b) => chips.push({ label: b, clear: (f) => ({ ...f, brands: f.brands.filter((x) => x !== b) }) }))
  filters.cities.forEach((c) => chips.push({ label: c, clear: (f) => ({ ...f, cities: f.cities.filter((x) => x !== c) }) }))
  if (filters.open !== 'any') chips.push({ label: filters.open === 'now' ? 'Open now' : 'Open 24/7', clear: (f) => ({ ...f, open: 'any' }) })
  if (filters.pricedOnly) chips.push({ label: 'With price', clear: (f) => ({ ...f, pricedOnly: false }) })
  filters.services.forEach((s) => chips.push({ label: SERVICE_LABELS[s], clear: (f) => ({ ...f, services: f.services.filter((x) => x !== s) }) }))
  filters.payments.forEach((p) => chips.push({ label: PAYMENT_LABELS[p], clear: (f) => ({ ...f, payments: f.payments.filter((x) => x !== p) }) }))
  if (filters.clubCard) chips.push({ label: 'Club card', clear: (f) => ({ ...f, clubCard: false }) })
  if (filters.cooperative) chips.push({ label: 'Cooperative', clear: (f) => ({ ...f, cooperative: false }) })
  if (filters.favoritesOnly) chips.push({ label: 'Favourites', clear: (f) => ({ ...f, favoritesOnly: false }) })
  if (!chips.length) return null
  return (
    <div className="no-scrollbar -mx-4 mt-2 flex items-center gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => setFilters(c.clear)}
          className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/10 py-1 pr-2 pl-3 text-xs font-medium whitespace-nowrap text-accent transition-colors hover:bg-accent/20 lg:py-0.5 lg:pr-1.5 lg:pl-2.5"
        >
          {c.label}
          <X className="size-3 opacity-60 group-hover:opacity-100" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, fuel: f.fuel, sort: f.sort, sortDir: f.sortDir }))}
          className="px-1.5 text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg active:scale-90 active:bg-sunken lg:rounded-lg">
      {children}
    </button>
  )
}

function ToolBtn({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:bg-sunken hover:text-fg active:scale-90 disabled:opacity-40 lg:size-8 lg:rounded-lg"
    >
      {children}
    </button>
  )
}

function Lbl({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className="hidden sm:inline">{text}</span>
    </span>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-sunken" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-sunken" />
        ))}
      </div>
    </div>
  )
}
