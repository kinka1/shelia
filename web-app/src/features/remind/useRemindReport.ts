import { useEffect } from 'react'
import { sheliaDone } from '@/features/shelia/SheliaCard'
import { remindPlatforms, remindToday } from '@/lib/remindApi'

/**
 * Tells the Telegram reminder what this person uses and what is done today. Each platform reports on its own
 * (a MagangHub-only person still gets their log counted). Only `true` is reported here: an expired token or
 * a lost session is not a logout; only the Keluar buttons report `false`.
 */
export function useRemindReport(p: {
  date: string; sheliaToken: string | null; sheliaName?: string; sheliaToday: any; mhConnected: boolean; sentAt: string | null
}) {
  const { date, sheliaToken, sheliaName, mhConnected, sentAt } = p
  useEffect(() => { if (sheliaToken) void remindPlatforms({ shelia: true, ...(sheliaName ? { sheliaName } : {}) }) }, [sheliaToken, sheliaName])
  useEffect(() => { if (mhConnected) void remindPlatforms({ maganghub: true }) }, [mhConnected])

  const masuk = !!sheliaToken && !!p.sheliaToday && sheliaDone(p.sheliaToday)
  const pulang = masuk && p.sheliaToday?.next_action !== 'check_out'
  useEffect(() => { if (masuk) void remindToday(date, { masuk, pulang }) }, [date, masuk, pulang])
  useEffect(() => { if (sentAt) void remindToday(date, { log: true }) }, [date, sentAt])
}
