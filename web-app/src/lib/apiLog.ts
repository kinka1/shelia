import { useSyncExternalStore } from 'react'
import { describeBody, redactHeaders, redactJson, redactPath } from './redact'

export type Source = 'shelia' | 'maganghub'
export interface LogEntry {
  id: number; action: string; source: Source; method: string; path: string
  title: string; status: number | null; ms: number; at: number
  reqHeaders: Record<string, string>; reqBody: unknown
  resHeaders: Record<string, string>; resBody: unknown
}

const MAX = 200
let entries: LogEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function useApiLog(): LogEntry[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => entries,
  )
}

export function clearLog(): void {
  entries = []
  emit()
}

const TITLES: Record<string, string> = {
  'POST /api/auth/login': 'Login',
  'POST /api/auth/logout': 'Keluar',
  'POST /api/attendance-integration/user/today': 'Cek status hari ini',
  'GET /api/v2/attendance/shifts/available': 'Ambil daftar shift',
  'POST /api/v2/attendance/face/verify': 'Verifikasi wajah',
  'POST /api/v2/attendance/check-in': 'Kirim absen masuk',
  'POST /api/v2/attendance/check-out': 'Kirim absen pulang',
  'GET /maganghub-api/v1/daily-logs': 'Ambil log MagangHub',
}

export function titleFor(method: string, path: string): string {
  const bare = path.split('?')[0]
  return TITLES[`${method.toUpperCase()} ${bare}`] ?? path
}

async function readBody(res: Response): Promise<unknown> {
  try {
    const t = await res.clone().text()
    try { return redactJson(JSON.parse(t)) } catch { return t ? t.slice(0, 2000) : '' }
  } catch (e) {
    return `(tidak terbaca: ${e})`
  }
}

export async function loggedFetch(url: string, init: RequestInit & { action: string }): Promise<Response> {
  const { action, ...rest } = init
  const method = (rest.method ?? 'GET').toUpperCase()
  const path = redactPath(url.replace(/^https?:\/\/[^/]+/, ''))
  const started = Date.now()
  let res: Response | null = null
  let resBody: unknown = null
  try {
    res = await fetch(url, rest)
    resBody = await readBody(res)
    return res
  } catch (e) {
    resBody = String((e as Error)?.message ?? e)
    throw e
  } finally {
    const entry: LogEntry = {
      id: nextId++, action, method, path,
      source: /^\/maganghub-api\//.test(path) ? 'maganghub' : 'shelia',
      title: titleFor(method, path),
      status: res ? res.status : null,
      ms: Date.now() - started, at: started,
      reqHeaders: redactHeaders(rest.headers), reqBody: describeBody(rest.body),
      resHeaders: res ? redactHeaders(res.headers) : {}, resBody,
    }
    entries = [entry, ...entries].slice(0, MAX)
    emit()
  }
}

export function groupEntries(e: LogEntry[]): { key: string; action: string; at: number; entries: LogEntry[] }[] {
  const groups: { key: string; action: string; at: number; entries: LogEntry[] }[] = []
  for (const x of e) {
    const last = groups[groups.length - 1]
    if (last && last.action === x.action) last.entries.push(x)
    else groups.push({ key: `${x.action}-${x.id}`, action: x.action, at: x.at, entries: [x] })
  }
  // Entries are newest first; the oldest id is fixed once a group exists, so the key survives new joiners.
  for (const g of groups) g.key = `${g.action}-${g.entries[g.entries.length - 1].id}`
  return groups
}

export function explain(e: LogEntry): { bad: boolean; title: string; text: string } {
  const b = (e.resBody && typeof e.resBody === 'object' ? e.resBody : {}) as { message?: unknown; error_code?: unknown }
  const msg = typeof b.message === 'string' ? b.message : ''
  if (e.status === null) return { bad: true, title: 'Gagal terhubung', text: 'Tidak bisa terhubung ke server.' }
  if (e.status < 400) return { bad: false, title: 'Berhasil', text: msg || 'Permintaan berhasil.' }
  const title = `Gagal (${e.status})`
  if (e.status === 401 || e.status === 403) return { bad: true, title, text: 'Sesi atau token tidak berlaku. Masuk lagi.' }
  const code = typeof b.error_code === 'string' ? ` (${b.error_code})` : ''
  return { bad: true, title, text: `${msg || 'Permintaan ditolak.'}${code}` }
}
