import type { ApiOpeningHour } from '../api/econtrol'

const DAY_CODES = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'] as const
export const DAY_LABELS_EN: Record<string, string> = {
  MO: 'Mon', DI: 'Tue', MI: 'Wed', DO: 'Thu', FR: 'Fri', SA: 'Sat', SO: 'Sun', FE: 'Holiday',
}

/** Current weekday + minutes-since-midnight in Austrian local time. */
export function viennaNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vienna',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const wd = parts.find((p) => p.type === 'weekday')!.value
  const h = Number(parts.find((p) => p.type === 'hour')!.value)
  const m = Number(parts.find((p) => p.type === 'minute')!.value)
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
  return { day: DAY_CODES[idx], minutes: h * 60 + m }
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function is24h(hours?: ApiOpeningHour[]) {
  if (!hours?.length) return false
  const week = hours.filter((h) => h.day !== 'FE')
  return week.length === 7 && week.every((h) => h.from === '00:00' && (h.to === '24:00' || h.to === '23:59'))
}

export function openStatus(hours?: ApiOpeningHour[], now = viennaNow()) {
  if (!hours?.length) return { open: null as boolean | null, label: 'Hours unknown' }
  if (is24h(hours)) return { open: true, label: 'Open 24/7' }
  const today = hours.filter((h) => h.day === now.day)
  for (const slot of today) {
    const from = toMin(slot.from)
    const to = toMin(slot.to)
    if (now.minutes >= from && now.minutes < to) return { open: true, label: `Open until ${slot.to}` }
  }
  const next = today.map((s) => toMin(s.from)).filter((f) => f > now.minutes).sort((a, b) => a - b)[0]
  if (next !== undefined) {
    const hh = String(Math.floor(next / 60)).padStart(2, '0')
    const mm = String(next % 60).padStart(2, '0')
    return { open: false, label: `Opens at ${hh}:${mm}` }
  }
  return { open: false, label: 'Closed' }
}
