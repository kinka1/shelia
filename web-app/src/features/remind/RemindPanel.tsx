import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { todayWIB } from '@/lib/dailyLog'
import { remindHoliday, remindMe, type RemindMe } from '@/lib/remindApi'

const mark = (on: boolean) => (on ? '✅' : '–')

/** What the Telegram reminder knows about you, and the way into the channel. Hidden while the service is off. */
export function RemindPanel() {
  const [me, setMe] = useState<RemindMe | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const load = async () => setMe(await remindMe())
  useEffect(() => { void load() }, [])
  if (!me) return null

  async function toggleHoliday() { setBusy(true); await remindHoliday(todayWIB(), !me!.holiday); await load(); setBusy(false) }
  async function copy() {
    try { await navigator.clipboard.writeText(me!.invite!); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { /* clipboard blocked: the Buka channel link still works */ }
  }

  return (
    <Card className="p-5 shadow-none">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Send className="size-4" /> Pengingat Telegram</h2>
      <p className="mt-1 text-sm">Nama di channel: {me.name}</p>
      <p className="text-sm text-muted-foreground">{`Shelia ${mark(me.shelia)} · MagangHub ${mark(me.maganghub)}`}</p>
      {me.invite && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href={me.invite} target="_blank" rel="noopener noreferrer"><ExternalLink /> Buka channel</a>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
            <Copy /> {copied ? 'Tersalin' : 'Salin link'}
          </Button>
        </div>
      )}
      {me.admin && (
        <div className="mt-3">
          <Button type="button" size="sm" variant={me.holiday ? 'default' : 'outline'} aria-pressed={me.holiday} disabled={busy} onClick={() => void toggleHoliday()}>
            Libur hari ini
          </Button>
          {me.holiday && <span className="ml-2 text-xs text-muted-foreground">Tidak ada pengingat hari ini.</span>}
        </div>
      )}
    </Card>
  )
}
