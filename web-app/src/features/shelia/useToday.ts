import { useCallback, useEffect, useState } from 'react'
import { CONFIG, errorText, sheliaApi, type ApiError } from '@/lib/shelia'
import { recordToday } from '@/lib/sheliaHistory'

export function useToday() {
  const [today, setToday] = useState<any>(null)
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async (action = 'Muat status hari ini') => {
    setLoading(true)
    setError('')
    try {
      const res = await sheliaApi('/attendance-integration/user/today', {
        method: 'POST', json: { lat: CONFIG.LAT, lng: CONFIG.LNG }, action,
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
      recordToday(t)
    } catch (e) {
      if ((e as ApiError).status !== 401) setError(errorText(e as ApiError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])
  return { today, shifts, loading, reload, error }
}
