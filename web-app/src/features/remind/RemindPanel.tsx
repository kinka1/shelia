import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayWIB } from '@/lib/dailyLog'
import { remindHoliday, remindMe, remindNick, type RemindMe } from '@/lib/remindApi'

const mark = (on: boolean) => (on ? '✅' : '–')

/** What the Telegram reminder knows about you. Hidden while the reminder service is off. */
export function RemindPanel() {
  const [me, setMe] = useState<RemindMe | null>(null)
  const [nick, setNick] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => { const m = await remindMe(); setMe(m); if (m) setNick(m.nick ?? '') }
  useEffect(() => { void load() }, [])
  if (!me) return null

  async function act(f: () => Promise<boolean>) { setBusy(true); await f(); await load(); setBusy(false) }

  return (
    <Card className="p-5 shadow-none">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Send className="size-4" /> Pengingat Telegram</h2>
      <p className="mt-1 text-sm">Nama di channel: {me.name}</p>
      <p className="text-sm text-muted-foreground">{`Shelia ${mark(me.shelia)} · MagangHub ${mark(me.maganghub)}`}</p>
      <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void act(() => remindNick(nick.trim() || null)) }}>
        <div className="space-y-1">
          <Label htmlFor="remind-nick" className="text-xs font-semibold text-muted-foreground">Nama pendek</Label>
          <Input id="remind-nick" value={nick} maxLength={20} placeholder={me.name} onChange={(e) => setNick(e.target.value)} className="h-8 w-44" />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={busy}>Simpan</Button>
      </form>
      {me.admin && (
        <div className="mt-3">
          <Button type="button" size="sm" variant={me.holiday ? 'default' : 'outline'} aria-pressed={me.holiday} disabled={busy}
            onClick={() => void act(() => remindHoliday(todayWIB(), !me.holiday))}>
            Libur hari ini
          </Button>
          {me.holiday && <span className="ml-2 text-xs text-muted-foreground">Tidak ada pengingat hari ini.</span>}
        </div>
      )}
    </Card>
  )
}
