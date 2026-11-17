import { useCallback, useEffect, useRef, useState } from 'react'
import { extAvailable, extToken } from '@/lib/extension'
import { MH_KEY, MH_REJECTED, setMhToken, signOutMh, mhSignedOut, fetchDailyLogs, getMhToken, tokenExpiry, type MhStatus } from '@/lib/maganghub'

export function useMhToken() {
  const [token, setToken] = useState<string | null>(getMhToken)
  const [rejected, setRejected] = useState(false) // 401/403 from MagangHub
  const tried = useRef(false)

  useEffect(() => {
    setRejected(false)
    if (!token) return
    let live = true
    void fetchDailyLogs(1).then((r) => { if (live && r.status === 'expired') setRejected(true) })
    return () => { live = false }
  }, [token])

  // Token saved by another test-shelia tab: pick it up here without a reload.
  // A 401/403 from any MagangHub request later on: the token stopped working.
  useEffect(() => {
    const h = (e: StorageEvent) => { if (e.key === MH_KEY) setToken(getMhToken()) }
    const no = () => setRejected(true)
    window.addEventListener('storage', h)
    window.addEventListener(MH_REJECTED, no)
    return () => { window.removeEventListener('storage', h); window.removeEventListener(MH_REJECTED, no) }
  }, [])

  // Keluar: forget the token here, and don't fetch it straight back from MagangHub's session.
  const disconnect = useCallback(() => { tried.current = true; signOutMh(); setToken(null) }, [])
  const refresh = useCallback(() => setToken(getMhToken()), [])
  const expiry = token ? tokenExpiry(token) : null
  // Re-check when the token's time is up, and on coming back to the tab (timers sleep with the laptop),
  // so a page left open doesn't keep saying Terhubung.
  const [, recheck] = useState(0)
  const until = expiry ? expiry.getTime() - Date.now() : 0
  useEffect(() => {
    if (until <= 0) return
    const t = setTimeout(() => recheck((n) => n + 1), Math.min(until + 1000, 2 ** 31 - 1))
    const back = () => { if (document.visibilityState === 'visible') recheck((n) => n + 1) }
    document.addEventListener('visibilitychange', back)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', back) }
  }, [until > 0, expiry?.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps
  const status: MhStatus = !token ? 'none' : rejected || (expiry && expiry.getTime() < Date.now()) ? 'expired' : 'ok'

  // With the extension, a missing or expired token is fetched quietly (once per page load).
  useEffect(() => {
    if (status === 'ok' || tried.current || mhSignedOut()) return
    tried.current = true
    void extAvailable().then((v) => v && extToken(false)).then((r) => {
      if (r && 'ok' in r && r.ok && r.token) { setMhToken(r.token); setToken(r.token) }
    })
  }, [status])
  return { token, status, expiry, disconnect, refresh }
}
