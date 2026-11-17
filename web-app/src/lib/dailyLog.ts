import { loggedFetch } from './apiLog'
import { getToken } from './shelia'

export const MIN_CHARS = 100
const BASE = '/monev-api/v1'

export function fieldState(text: string) {
  const count = text.trim().length
  return { count, ok: count >= MIN_CHARS, missing: Math.max(0, MIN_CHARS - count) }
}

export const remainingFields = (v: { activity_log: string; lesson_learned: string; obstacles: string }): number =>
  [v.activity_log, v.lesson_learned, v.obstacles].filter((x) => !fieldState(x).ok).length

export const todayWIB = (now = new Date()): string => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)

const headers = () => ({ Authorization: `Bearer ${getToken() ?? ''}` })

export class DailyLogError extends Error {
  status: number
  errors: Record<string, string>
  constructor(message: string, status: number, errors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export async function submitDailyLog(v: { date: string; activity_log: string; lesson_learned: string; obstacles: string }): Promise<void> {
  const res = await loggedFetch(`${BASE}/attendances/with-daily-log`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...v, status: 'PRESENT', location: 'Surabaya' }),
    action: 'Kirim log harian',
  })
  if (res.ok) return
  const b = await res.json().catch(() => ({}))
  throw new DailyLogError(b?.message || `Gagal mengirim (HTTP ${res.status})`, res.status, b?.errors ?? {})
}

export async function fetchMyToday(date: string): Promise<{ sentAt: string } | null> {
  try {
    const res = await loggedFetch(`${BASE}/daily-logs?page=1`, { headers: headers(), action: 'Cek log hari ini' })
    if (!res.ok) return null
    const b = await res.json()
    const row = (Array.isArray(b?.data) ? b.data : []).find((r: any) => String(r?.date ?? '').slice(0, 10) === date)
    return row ? { sentAt: row.clock_in ?? '-' } : null
  } catch { return null }
}
