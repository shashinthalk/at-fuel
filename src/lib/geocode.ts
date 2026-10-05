// Address / place search via OpenStreetMap Nominatim, limited to Austria.
export interface Place {
  label: string
  lat: number
  lon: number
}

export async function geocode(q: string, signal?: AbortSignal): Promise<Place[]> {
  const qs = new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'at', limit: '6', addressdetails: '0' })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
    signal,
    headers: { 'Accept-Language': 'de,en' },
  })
  if (!res.ok) throw new Error('Geocoding failed')
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[]
  return data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lon: Number(d.lon) }))
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<string> {
  const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '14' })
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${qs}`, { signal })
    const d = (await res.json()) as { address?: Record<string, string>; display_name?: string }
    const a = d.address ?? {}
    return a.city || a.town || a.village || a.municipality || d.display_name?.split(',')[0] || 'Selected point'
  } catch {
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`
  }
}
