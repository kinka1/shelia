import { loggedFetch } from './apiLog'

export const MH_KEY = 'maganghub.token'
const API = '/maganghub-api/v1'

export type MhStatus = 'none' | 'ok' | 'expired'
export interface MhLog { date: string; clock_in?: string; status?: string; activity_log?: string; lesson_learned?: string; obstacles?: string }

export function takeTokenFromHash(hash: string): string | null {
  const m = /^#mh=(.+)$/.exec(hash || '')
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return null }
}

// Runs on MagangHub's own page: hands the token over in the URL fragment (never sent to a server).
export function bookmarkletHref(origin: string): string {
  const code = "(function(){if(location.hostname!=='monev.maganghub.kemnaker.go.id'){alert('Buka halaman MagangHub dulu');return}var t=sessionStorage.getItem('monev_access_token');" +
    "if(!t){alert('Login MagangHub dulu');return}" +
    'window.open(' + JSON.stringify(origin + '/#mh=') + "+encodeURIComponent(t),'_blank','noopener')})();"
  return 'javascript:' + encodeURI(code).replace(/#/g, '%23') // a raw # would truncate a saved bookmark
}

export const getMhToken = (): string | null => { try { return localStorage.getItem(MH_KEY) } catch { return null } }
export const clearMhToken = (): void => { try { localStorage.removeItem(MH_KEY) } catch { /* storage blocked */ } }

export function intakeTokenFromLocation(): void {
  const t = takeTokenFromHash(location.hash)
  if (!t) return
  try { localStorage.setItem(MH_KEY, t) } catch { /* storage blocked */ }
  history.replaceState(null, '', location.pathname + location.search)
}

export function tokenExpiry(token: string): Date | null {
  try {
    const p = token.split('.')[1]
    if (!p) return null
    const exp = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).exp
    return typeof exp === 'number' ? new Date(exp * 1000) : null
  } catch { return null }
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
    rows: Array.isArray(body?.data) ? body.data : [],
    total: typeof body?.total === 'number' ? body.total : null,
  }
}
