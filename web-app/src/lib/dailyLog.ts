import { loggedFetch } from './apiLog'
import { getMhToken } from './maganghub'

export const MIN_CHARS = 100
// Real MagangHub, read-only through our nginx (GET daily-logs). Sending happens on MagangHub's own page.
const BASE = '/maganghub-api/v1'

export function fieldState(text: string) {
  const count = text.trim().length
  return { count, ok: count >= MIN_CHARS, missing: Math.max(0, MIN_CHARS - count) }
}

export const remainingFields = (v: { activity_log: string; lesson_learned: string; obstacles: string }): number =>
  [v.activity_log, v.lesson_learned, v.obstacles].filter((x) => !fieldState(x).ok).length

export const todayWIB = (now = new Date()): string => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)


/** Log for this date already on MagangHub? Newest logs come first, so page 1 covers recent days. */
export async function fetchMyToday(date: string): Promise<{ sentAt: string } | null> {
  const t = getMhToken()
  if (!t) return null
  try {
    const res = await loggedFetch(`${BASE}/daily-logs?page=1`, { headers: { Authorization: `Bearer ${t}` }, action: 'Cek log hari ini' })
    if (!res.ok) return null
    const b = await res.json()
    const row = (Array.isArray(b?.data) ? b.data : []).find((r: any) => String(r?.date ?? '').slice(0, 10) === date)
    if (!row) return null
    const at = typeof row.created_at === 'string' ? row.created_at.slice(11, 16) : typeof row.clock_in === 'string' ? row.clock_in : ''
    return { sentAt: at || '-' }
  } catch { return null }
}
