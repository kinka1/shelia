import { useCallback, useEffect, useState } from 'react'

// The "Shelia MagangHub" Chrome extension (repo: extension/). Its ID is fixed by the manifest key.
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
  const r = await call({ type: 'hello' }, 800)
  return r && 'ok' in r && r.ok && r.version ? { version: r.version } : null
}

const LONG = 6 * 60_000 // covers the extension's 5-minute wait for a MagangHub login
export const extToken = async (interactive: boolean): Promise<ExtResult> =>
  (await call({ type: 'token', interactive }, interactive ? LONG : 30_000)) ?? { error: 'missing' }
export const extSend = async (body: object): Promise<ExtResult> =>
  (await call({ type: 'send', body }, LONG)) ?? { error: 'missing' }

/** Installed extension version (null = not installed / not yet known) and a way to look again. */
export function useExtension() {
  const [version, setVersion] = useState<string | null>(null)
  const recheck = useCallback(() => extAvailable().then((v) => { setVersion(v?.version ?? null); return v }), [])
  useEffect(() => { void recheck() }, [recheck])
  return { version, recheck }
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
