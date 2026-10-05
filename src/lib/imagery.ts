// Location imagery for a station. The E-Control API has no photos, so we use:
//  - Esri World Imagery satellite tiles (no key needed) — always available
//  - OpenStreetMap tiles for a street-map view
//  - Mapillary street-level photos, when VITE_MAPILLARY_TOKEN is configured

export type ImageryKind = 'satellite' | 'map'

const TILE = 256

export function tileUrl(kind: ImageryKind, z: number, x: number, y: number) {
  return kind === 'satellite'
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

/** Fractional Web-Mercator tile coordinates of a point. */
function project(lat: number, lon: number, z: number) {
  const n = 2 ** z
  const rad = (lat * Math.PI) / 180
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  }
}

/**
 * The tiles needed to fill a `width`×`height` box centred on the point,
 * with each tile's pixel offset inside that box.
 */
export function tilesFor(lat: number, lon: number, z: number, width: number, height: number) {
  const { x, y } = project(lat, lon, z)
  const originX = x * TILE - width / 2
  const originY = y * TILE - height / 2
  const tiles: { x: number; y: number; left: number; top: number }[] = []
  for (let tx = Math.floor(originX / TILE); tx * TILE < originX + width; tx++) {
    for (let ty = Math.floor(originY / TILE); ty * TILE < originY + height; ty++) {
      tiles.push({ x: tx, y: ty, left: tx * TILE - originX, top: ty * TILE - originY })
    }
  }
  return tiles
}

export const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN as string | undefined

export interface StreetPhoto {
  id: string
  url: string
  capturedAt?: number
}

/** Up to `limit` street-level photos within ~60 m of the point. */
export async function fetchStreetPhotos(lat: number, lon: number, limit = 4, signal?: AbortSignal): Promise<StreetPhoto[]> {
  if (!MAPILLARY_TOKEN) return []
  const d = 0.0006
  const qs = new URLSearchParams({
    access_token: MAPILLARY_TOKEN,
    fields: 'id,thumb_1024_url,captured_at',
    bbox: [lon - d, lat - d, lon + d, lat + d].join(','),
    limit: String(limit),
  })
  const res = await fetch(`https://graph.mapillary.com/images?${qs}`, { signal })
  if (!res.ok) return []
  const json = (await res.json()) as { data?: { id: string; thumb_1024_url: string; captured_at?: number }[] }
  return (json.data ?? []).map((p) => ({ id: p.id, url: p.thumb_1024_url, capturedAt: p.captured_at }))
}
