import { loggedFetch } from './apiLog'

export const CONFIG = { API_BASE: '/api' as const, LAT: -7.308430344545027, LNG: 112.785199930883 }

/** The point moved 1-5 m in a random direction, so no two sends carry the exact same coordinates. */
export function jitter(p: { lat: number; lng: number }, rand = Math.random): { lat: number; lng: number } {
  const d = 1 + rand() * 4, a = rand() * 2 * Math.PI
  return { lat: p.lat + (d * Math.cos(a)) / 111320, lng: p.lng + (d * Math.sin(a)) / (111320 * Math.cos((p.lat * Math.PI) / 180)) }
}

const STORAGE = { token: 'absen.token', employee: 'absen.employee' }

export interface Employee { full_name?: string; nik?: string; branch_name?: string }

export class ApiError extends Error {
  status?: number
  code?: string
  meta?: any
  errors?: any
  retryAfter?: string | null
  constructor(message: string, info: Partial<Omit<ApiError, keyof Error>> = {}) {
    super(message)
    Object.assign(this, info)
  }
}

const storageGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const storageSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* abaikan */ } }
const storageDel = (k: string) => { try { localStorage.removeItem(k) } catch { /* abaikan */ } }

export const getToken = (): string | null => storageGet(STORAGE.token)
export function getEmployee(): Employee | null {
  try { return JSON.parse(storageGet(STORAGE.employee) || 'null') } catch { return null }
}
export function saveSession(token: string, emp: object): void {
  storageSet(STORAGE.token, token)
  storageSet(STORAGE.employee, JSON.stringify(emp))
}
/** Forget the Shelia login only; MagangHub has its own Keluar. */
/** everything = Keluar: also erases what Shelia kept here. An expired login (false) keeps the history. */
export function clearSession(everything = false): void {
  storageDel(STORAGE.token)
  storageDel(STORAGE.employee)
  if (everything) storageDel('shelia.history')
}

const unauthorized = new Set<() => void>()
export function onUnauthorized(cb: () => void): () => void {
  unauthorized.add(cb)
  return () => { unauthorized.delete(cb) }
}

export async function sheliaApi<T = any>(
  path: string,
  o: { method?: string; json?: unknown; form?: FormData; auth?: boolean; action: string },
): Promise<T> {
  const { method = 'GET', json, form, auth = true, action } = o
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': 'id' }
  const token = getToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
  }

  let res: Response
  try {
    res = await loggedFetch(CONFIG.API_BASE + path, { method, headers, body, action })
  } catch {
    throw new ApiError('Tidak bisa terhubung ke server. Periksa koneksi internet.', { code: 'NETWORK' })
  }

  let data: any = null
  try { data = await res.json() } catch { /* respons bukan JSON */ }

  if (!res.ok || (data && data.status === 'error')) {
    const err = new ApiError(
      (data && typeof data.message === 'string' && data.message) || `Permintaan gagal (HTTP ${res.status}).`,
      {
        status: res.status,
        code: data?.error_code,
        meta: data?.meta,
        errors: data?.errors,
        retryAfter: res.headers.get('Retry-After'),
      },
    )
    if (res.status === 401 && auth) {
      clearSession()
      unauthorized.forEach((cb) => cb())
    }
    throw err
  }
  return (data || {}) as T
}

export function errorText(err: ApiError): string {
  let msg = err.message || 'Terjadi kesalahan.'
  if (err.code && err.code !== 'NETWORK') msg += ` (${err.code})`
  if (err.errors && typeof err.errors === 'object') {
    const lines = (Object.values(err.errors).flat() as any[])
      .map((e) => (typeof e === 'string' ? e : e?.message))
      .filter(Boolean)
    if (lines.length) msg += '\n' + lines.join('\n')
  }
  if (err.meta && err.meta.attempts_remaining != null) {
    msg += `\nSisa percobaan verifikasi wajah: ${err.meta.attempts_remaining}.`
  }
  if (err.retryAfter) msg += `\nCoba lagi dalam ${err.retryAfter} detik.`
  return msg
}
