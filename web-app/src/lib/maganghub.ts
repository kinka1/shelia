import { loggedFetch } from './apiLog'

export const MH_KEY = 'maganghub.token'
const API = '/maganghub-api/v1'

export type MhStatus = 'none' | 'ok' | 'expired'
export interface MhLog { date: string; clock_in?: string; status?: string; state?: string; created_at?: string; activity_log?: string; lesson_learned?: string; obstacles?: string }

export const getMhToken = (): string | null => { try { return localStorage.getItem(MH_KEY) } catch { return null } }
// Set by Keluar so no quiet re-fetch brings the token back; cleared when a token is saved again.
const OUT_KEY = 'maganghub.keluar'
export const mhSignedOut = (): boolean => { try { return localStorage.getItem(OUT_KEY) === '1' } catch { return false } }
export const setMhToken = (t: string): void => { try { localStorage.setItem(MH_KEY, t); localStorage.removeItem(OUT_KEY) } catch { /* storage blocked */ } }
// Keluar erases everything the MagangHub card kept here (token, draft, Generate keys); only the marker stays,
// so a reload doesn't silently fetch the token again.
export const signOutMh = (): void => {
  try { for (const k of [MH_KEY, 'maganghub.draft', 'generate.settings']) localStorage.removeItem(k); localStorage.setItem(OUT_KEY, '1') } catch { /* storage blocked */ }
}

export function tokenExpiry(token: string): Date | null {
  try {
    const p = token.split('.')[1]
    if (!p) return null
    const exp = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).exp
    return typeof exp === 'number' ? new Date(exp * 1000) : null
  } catch { return null }
}

const TEXT = ['date', 'clock_in', 'status', 'state', 'created_at', 'activity_log', 'lesson_learned', 'obstacles'] as const
// An odd field type must not crash rendering: numbers become text, objects and null become ''.
const clean = (r: any): MhLog => {
  const o = { ...r }
  for (const k of TEXT) if (k in o && typeof o[k] !== 'string') o[k] = typeof o[k] === 'number' || typeof o[k] === 'boolean' ? String(o[k]) : ''
  // Real MagangHub rows: no clock_in/status; the send time is created_at and the status is the review state.
  // ponytail: created_at has no timezone; shown as given (assumed WIB).
  if (!o.clock_in && o.created_at) o.clock_in = o.created_at.slice(11, 16)
  if (o.state) o.status = o.state
  return o
}

export async function fetchDailyLogs(page: number, action = 'Ambil log MagangHub'): Promise<{ status: MhStatus; rows: MhLog[]; total: number | null; error?: string }> {
  const t = getMhToken()
  if (!t) return { status: 'none', rows: [], total: null }
  let res: Response
  try {
    res = await loggedFetch(`${API}/daily-logs?page=${page}`, { headers: { Authorization: 'Bearer ' + t }, action })
  } catch { return { status: 'ok', rows: [], total: null, error: 'Gagal terhubung' } }
  if (res.status === 401 || res.status === 403) return { status: 'expired', rows: [], total: null }
  if (!res.ok) return { status: 'ok', rows: [], total: null, error: `Gagal memuat (HTTP ${res.status})` }
  let body: any = null
  try { body = await res.json() } catch { return { status: 'ok', rows: [], total: null, error: 'Respons bukan JSON' } }
  return {
    status: 'ok',
    rows: Array.isArray(body?.data) ? body.data.filter((r: unknown) => r && typeof r === 'object').map(clean) : [],
    total: typeof body?.total === 'number' ? body.total : null,
  }
}
