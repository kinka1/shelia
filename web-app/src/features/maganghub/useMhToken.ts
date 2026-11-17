import { useCallback, useEffect, useState } from 'react'
import { MH_KEY, clearMhToken, fetchDailyLogs, getMhToken, tokenExpiry, type MhStatus } from '@/lib/maganghub'

export function useMhToken() {
  const [token, setToken] = useState<string | null>(getMhToken)
  const [rejected, setRejected] = useState(false) // 401/403 from MagangHub

  useEffect(() => {
    setRejected(false)
    if (!token) return
    let live = true
    void fetchDailyLogs(1).then((r) => { if (live && r.status === 'expired') setRejected(true) })
    return () => { live = false }
  }, [token])

  // Token saved by the bookmark's tab: pick it up here without a reload.
  useEffect(() => {
    const h = (e: StorageEvent) => { if (e.key === MH_KEY) setToken(getMhToken()) }
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }, [])

  const disconnect = useCallback(() => { clearMhToken(); setToken(null) }, [])
  const refresh = useCallback(() => setToken(getMhToken()), [])
  const expiry = token ? tokenExpiry(token) : null
  const status: MhStatus = !token ? 'none' : rejected || (expiry && expiry.getTime() < Date.now()) ? 'expired' : 'ok'
  return { token, status, expiry, disconnect, refresh }
}
