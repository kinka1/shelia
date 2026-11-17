import { useCallback, useEffect, useState } from 'react'

// The "Phoenix MagangHub" Chrome extension (repo: extension/). Its ID is fixed by the manifest key.
export const EXT_ID = 'fiagillffjfgpckjfblgknnhhcahecdj'
export const EXT_ZIP = '/shelia-maganghub.zip'

export type ExtResult =
  | { ok: true; version?: string; token?: string; status?: number }
  | { ok?: undefined; error: string; status?: number; message?: string }

type Runtime = { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => void; lastError?: unknown }
const runtime = (): Runtime | undefined => (globalThis as { chrome?: { runtime?: Runtime } }).chrome?.runtime

/** One message to the extension; null when it isn't installed or doesn't answer in time. */
function call(msg: unknown, ms: number): Promise<ExtResult | null> {
  const rt = runtime()
  if (!rt?.sendMessage) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    try {
      rt.sendMessage(EXT_ID, msg, (r) => {
        clearTimeout(timer)
        void rt.lastError // reading it silences Chrome's "unchecked lastError" when not installed
        resolve(r && typeof r === 'object' ? (r as ExtResult) : null)
      })
    } catch { clearTimeout(timer); resolve(null) }
  })
}

export async function extAvailable(): Promise<{ version: string } | null> {
  const r = await call({ type: 'hello' }, 2000) // a sleeping worker can take a moment to wake
  return r && 'ok' in r && r.ok && r.version ? { version: r.version } : null
}

const LONG = 6 * 60_000 // covers the extension's 5-minute wait for a MagangHub login
export const extToken = async (interactive: boolean): Promise<ExtResult> =>
  (await call({ type: 'token', interactive }, interactive ? LONG : 30_000)) ?? { error: 'missing' }
export const extSend = async (body: object): Promise<ExtResult> =>
  (await call({ type: 'send', body }, LONG)) ?? { error: 'missing' }

export const EXT_POLL_MS = 3000

type Shift = Record<string, unknown> | undefined
const hm = (t: unknown) => (typeof t === 'string' && /^\d\d:\d\d/.test(t) ? t.slice(0, 5) : null)
/** Reminder events from a shift (option A): check-in closes, check-out opens. */
export function remindSchedule(s: Shift): { masuk: string; pulang: string } | null {
  const masuk = hm(s?.check_in_end), pulang = hm(s?.check_out_start)
  return masuk && pulang ? { masuk, pulang } : null
}
/** Tell the reminder in the extension the shift times or today's status: times and flags only, never tokens. */
export const extRemind = (m: { schedule?: object; status?: object }) => call({ type: 'remind', ...m }, 2000)

/** Installed extension version; null when absent, undefined while the first check runs.
 *  Re-checked every few seconds while the tab is visible (a hello costs ~1 ms), so removing or
 *  disabling it shows up without a reload; the extension reloads this page after an install. */
export function useExtension() {
  const [version, setVersion] = useState<string | null | undefined>(undefined)
  const recheck = useCallback(() => extAvailable().then((v) => { setVersion(v?.version ?? null); return v }), [])
  // Checks only until the extension is found. Once found it stays found: a sleeping worker can miss
  // one answer, and flipping to "not installed" would unmount the log form and lose what was typed.
  // An extension removed later shows up as an error when sending.
  const found = version != null
  useEffect(() => {
    if (found) return
    void recheck()
    const again = () => { if (document.visibilityState === 'visible') void recheck() }
    const timer = setInterval(again, EXT_POLL_MS)
    document.addEventListener('visibilitychange', again)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', again) }
  }, [recheck, found])
  return { version, recheck }
}

export type SendLog = { date: string; activity_log: string; lesson_learned: string; obstacles: string; latitude?: number; longitude?: number }

/** MagangHub's create payload: date, status, the three texts, coordinates only when present. */
export function sendBody(v: SendLog): Record<string, unknown> {
  const body: Record<string, unknown> = {
    date: v.date, status: 'PRESENT', activity_log: v.activity_log, lesson_learned: v.lesson_learned, obstacles: v.obstacles,
  }
  if (Number.isFinite(v.latitude) && Number.isFinite(v.longitude)) { body.latitude = v.latitude; body.longitude = v.longitude }
  return body
}

/** Plain-language message for a failed extension request. */
export function extError(r: ExtResult): string {
  if ('ok' in r && r.ok) return ''
  const e = r as Exclude<ExtResult, { ok: true }>
  if (e.error === 'login' || e.error === 'timeout' || e.error === 'closed') return 'Login MagangHub di tab yang terbuka, lalu klik lagi.'
  if (e.error === 'http') return `MagangHub menolak (HTTP ${e.status}): ${e.message || 'tanpa pesan'}`
  if (e.error === 'invalid') return e.message || 'Data log tidak valid.'
  return 'Ekstensi tidak merespons. Coba lagi.'
}
