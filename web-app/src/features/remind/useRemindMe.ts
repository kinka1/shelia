import { useCallback, useEffect, useState } from 'react'
import { remindMe, type RemindMe } from '@/lib/remindApi'

/** What the Telegram reminder knows about you (null while the service is off). `reload` after a change. */
export function useRemindMe() {
  const [me, setMe] = useState<RemindMe | null>(null)
  const reload = useCallback(async () => setMe(await remindMe()), [])
  useEffect(() => { void reload() }, [reload])
  return { me, reload }
}
