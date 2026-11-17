import { loggedFetch } from './apiLog'
import { getMhToken } from './maganghub'

export const MIN_CHARS = 100
// Real MagangHub, through our nginx: GET daily-logs and this one POST are the only routes let through.
const BASE = '/maganghub-api/v1'

export function fieldState(text: string) {
  const count = text.trim().length
  return { count, ok: count >= MIN_CHARS, missing: Math.max(0, MIN_CHARS - count) }
}

export const remainingFields = (v: { activity_log: string; lesson_learned: string; obstacles: string }): number =>
  [v.activity_log, v.lesson_learned, v.obstacles].filter((x) => !fieldState(x).ok).length

export const todayWIB = (now = new Date()): string => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)


export class DailyLogError extends Error {
  status: number
  errors: Record<string, string>
  constructor(message: string, status: number, errors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export type DailyLogInput = { date: string; activity_log: string; lesson_learned: string; obstacles: string; latitude: number; longitude: number }

/** Same request MagangHub's own form makes: one POST records attendance (Hadir) and the daily log together. */
export async function submitDailyLog(v: DailyLogInput): Promise<void> {
  const t = getMhToken()
  if (!t) throw new DailyLogError('MagangHub belum terhubung.', 401)
  const res = await loggedFetch(`${BASE}/attendances`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: v.date, status: 'PRESENT',
      activity_log: v.activity_log, lesson_learned: v.lesson_learned, obstacles: v.obstacles,
      latitude: v.latitude, longitude: v.longitude,
    }),
    action: 'Kirim log harian',
  })
  if (res.ok) return
  const b = await res.json().catch(() => ({}))
  const msg = res.status === 401 || res.status === 403 ? 'Token MagangHub kedaluwarsa. Perbarui token lalu kirim lagi.'
    : b?.message || b?.error || `Gagal mengirim (HTTP ${res.status})`
  throw new DailyLogError(String(msg), res.status, b?.errors && typeof b.errors === 'object' ? b.errors : {})
}

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
