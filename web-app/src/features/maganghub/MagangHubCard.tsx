import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DailyLogError, MIN_CHARS, fetchMyToday, fieldState, remainingFields, submitDailyLog, todayWIB } from '@/lib/dailyLog'
import { TokenDialog } from './TokenDialog'
import { useMhToken } from './useMhToken'

const FIELDS = [
  ['activity_log', 'Aktivitas'],
  ['lesson_learned', 'Pembelajaran'],
  ['obstacles', 'Kendala'],
] as const
type Key = (typeof FIELDS)[number][0]

const BADGE = {
  ok: ['Terhubung', 'bg-success/10 text-success-ink', CheckCircle2],
  none: ['Belum terhubung', 'bg-muted text-muted-foreground', Circle],
  expired: ['Kedaluwarsa', 'bg-warning/10 text-warning-ink', AlertTriangle],
} as const

const hhmm = (d: Date) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':')

export function MagangHubCard({ onSentAt }: { onSentAt?: (sentAt: string | null) => void }) {
  const mh = useMhToken()
  const [date, setDate] = useState(() => todayWIB())
  const [v, setV] = useState<Record<Key, string>>({ activity_log: '', lesson_learned: '', obstacles: '' })
  const [fieldErr, setFieldErr] = useState<Partial<Record<Key, string>>>({})
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState<string | null>(null)

  async function check(d = date) {
    const r = await fetchMyToday(d)
    setSentAt(r?.sentAt ?? null)
    onSentAt?.(r?.sentAt ?? null)
  }
  useEffect(() => { void check() }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const left = remainingFields(v)
  const [label, tone, Icon] = BADGE[mh.status]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || left) return
    setBusy(true); setFormErr(''); setFieldErr({})
    try {
      await submitDailyLog({ date, ...v })
      toast.success('Log harian terkirim')
      await check()
    } catch (err) {
      if (err instanceof DailyLogError && err.status === 409) { await check(); return }
      if (err instanceof DailyLogError && err.status === 422) setFieldErr(err.errors as Partial<Record<Key, string>>)
      setFormErr(err instanceof Error ? err.message : 'Gagal mengirim')
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">MagangHub</CardTitle>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}><Icon className="size-3" /> {label}</span>
          {mh.expiry && <span className="text-xs text-muted-foreground">berlaku sampai {hhmm(mh.expiry)}</span>}
        </div>
        <TokenDialog connected={!!mh.token} onDisconnect={mh.disconnect} />
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mh-date">Tanggal</Label>
              <Input id="mh-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5"><Label htmlFor="mh-status">Status</Label><Input id="mh-status" value="Hadir" readOnly /></div>
            <div className="space-y-1.5"><Label htmlFor="mh-loc">Lokasi</Label><Input id="mh-loc" value="Surabaya" readOnly /></div>
          </div>
          {FIELDS.map(([k, name]) => {
            const s = fieldState(v[k])
            return (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`mh-${k}`}>{name}</Label>
                <Textarea id={`mh-${k}`} rows={3} value={v[k]} disabled={!!sentAt}
                  onChange={(e) => setV({ ...v, [k]: e.target.value })} />
                <p aria-live="polite" className={`text-xs ${s.ok ? 'text-success-ink' : 'text-warning-ink'}`}>
                  {s.ok ? `✓ ${s.count} karakter` : `${s.count} / ${MIN_CHARS} karakter · kurang ${s.missing}`}
                </p>
                {fieldErr[k] && <p className="text-xs text-destructive-ink">{fieldErr[k]}</p>}
              </div>
            )
          })}
          {formErr && <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-ink">{formErr}</div>}
          <div className="flex items-center gap-3">
            {sentAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success-ink">
                <CheckCircle2 className="size-3" /> Terkirim {sentAt}
              </span>
            ) : (
              <>
                <Button type="submit" disabled={busy || left > 0}>Kirim log</Button>
                {left > 0 && <span className="text-sm text-muted-foreground">Lengkapi {left} isian lagi</span>}
              </>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
