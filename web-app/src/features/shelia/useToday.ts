import { useCallback, useEffect, useState } from 'react'
import { CONFIG, errorText, jitter, sheliaApi, type ApiError } from '@/lib/shelia'

/** Shelia's status for today; does nothing until there is a Shelia login. */
export function useToday(enabled = true) {
  const [today, setToday] = useState<any>(null)
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async (action = 'Muat status hari ini') => {
    setLoading(true)
    setError('')
    try {
      const res = await sheliaApi('/attendance-integration/user/today', {
        method: 'POST', json: jitter({ lat: CONFIG.LAT, lng: CONFIG.LNG }), action,
      })
      const t = res.data || {}
      let list: any[] = []
      if (t.next_action === 'check_in') {
        try {
          const s = await sheliaApi('/v2/attendance/shifts/available', { action: 'Muat shift' })
          list = Array.isArray(s.data) ? s.data : []
        } catch (e) {
          if ((e as ApiError).status !== 401) setError(errorText(e as ApiError))
        }
      }
      setToday(t)
      setShifts(list)
    } catch (e) {
      if ((e as ApiError).status !== 401) setError(errorText(e as ApiError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (enabled) void reload() }, [reload, enabled])
  return { today, shifts, loading, reload, error }
}
