import { useEffect, useState } from 'react'
import { DEFAULT_FILTERS, type Filters } from '../lib/filters'
import type { SearchTarget } from './useStations'

// Filters + search target are mirrored into the URL so a view can be shared.

const DEFAULT_TARGET: SearchTarget = {
  kind: 'location',
  center: { lat: 48.0347, lon: 14.2081 },
  label: 'Bad Hall',
  scan: 'single',
}

function parse(): { filters: Filters; target: SearchTarget } {
  const p = new URLSearchParams(location.search)
  const filters: Filters = { ...DEFAULT_FILTERS }
  const raw = p.get('f')
  if (raw) {
    try {
      Object.assign(filters, JSON.parse(raw))
    } catch {
      /* ignore malformed */
    }
  }
  let target = DEFAULT_TARGET
  const t = p.get('t')
  if (t) {
    try {
      target = JSON.parse(t) as SearchTarget
    } catch {
      /* ignore malformed */
    }
  }
  return { filters, target }
}

function diff(f: Filters) {
  const out: Partial<Filters> = {}
  for (const k of Object.keys(f) as (keyof Filters)[]) {
    if (JSON.stringify(f[k]) !== JSON.stringify(DEFAULT_FILTERS[k])) (out as Record<string, unknown>)[k] = f[k]
  }
  return out
}

export function useUrlState() {
  const [initial] = useState(parse)
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [target, setTarget] = useState<SearchTarget>(initial.target)

  useEffect(() => {
    // Keep any other parameters (e.g. dev flags); only `f` and `t` are owned here.
    const p = new URLSearchParams(location.search)
    const d = diff(filters)
    if (Object.keys(d).length) p.set('f', JSON.stringify(d))
    else p.delete('f')
    p.set('t', JSON.stringify(target))
    history.replaceState(null, '', `${location.pathname}?${p}`)
  }, [filters, target])

  return { filters, setFilters, target, setTarget }
}
