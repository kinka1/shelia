import { useCallback, useEffect, useRef, useState } from 'react'
import { extAvailable, extToken } from '@/lib/extension'
import { MH_KEY, setMhToken, signOutMh, mhSignedOut, fetchDailyLogs, getMhToken, tokenExpiry, type MhStatus } from '@/lib/maganghub'

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
  useEffect(() => {
    const h = (e: StorageEvent) => { if (e.key === MH_KEY) setToken(getMhToken()) }
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }, [])

  // Keluar: forget the token here, and don't fetch it straight back from MagangHub's session.
  const disconnect = useCallback(() => { tried.current = true; signOutMh(); setToken(null) }, [])
  const refresh = useCallback(() => setToken(getMhToken()), [])
  const expiry = token ? tokenExpiry(token) : null
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
