import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DailyLogError, MIN_CHARS, fetchMyToday, fieldState, remainingFields, submitDailyLog, todayWIB } from '@/lib/dailyLog'
import { StatusPill } from '@/features/shelia/Sessions'
import { TokenDialog } from './TokenDialog'
import { useMhToken } from './useMhToken'

const FIELDS = [
  ['activity_log', 'Aktivitas'],
  ['lesson_learned', 'Pembelajaran'],
  ['obstacles', 'Kendala'],
] as const
type Key = (typeof FIELDS)[number][0]

// [kunci tint StatusPill, label]
const CONN = {
  ok: ['closed', 'Terhubung'],
  none: ['', 'Belum terhubung'],
  expired: ['late', 'Kedaluwarsa'],
} as const

const LABEL = 'text-xs font-semibold text-muted-foreground'
const READ_ONLY = 'bg-muted text-muted-foreground focus-visible:ring-0'

const hhmm = (d: Date) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':')

export function MagangHubCard({ onSentAt }: { onSentAt?: (sentAt: string | null) => void }) {
  const mh = useMhToken()
  const [date, setDate] = useState(() => todayWIB())
  const [v, setV] = useState<Record<Key, string>>({ activity_log: '', lesson_learned: '', obstacles: '' })
  const [fieldErr, setFieldErr] = useState<Partial<Record<Key, string>>>({})
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const seq = useRef(0)
  async function check(d = date) {
    const id = ++seq.current
    const r = await fetchMyToday(d)
    if (id !== seq.current) return r // tanggal sudah berganti: jawaban lama dibuang
    setSentAt(r?.sentAt ?? null)
    if (d === todayWIB()) onSentAt?.(r?.sentAt ?? null)
    return r
  }
  useEffect(() => { void check() }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const left = remainingFields(v)
  const [connKey, connLabel] = CONN[mh.status]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || left) return
    setBusy(true); setFormErr(''); setFieldErr({})
    try {
      await submitDailyLog({ date, ...v })
      toast.success('Log harian terkirim')
      await check()
    } catch (err) {
      if (err instanceof DailyLogError && err.status === 409) {
        if (!(await check())) setFormErr('Log untuk tanggal ini sudah ada.')
        return
      }
      if (err instanceof DailyLogError && err.status === 422) {
        setFieldErr(Object.fromEntries(Object.entries(err.errors).map(([k, m]) => [k, /wajib/i.test(String(m)) ? 'Wajib diisi' : `Minimal ${MIN_CHARS} karakter`])))
      }
      setFormErr(err instanceof Error ? err.message : 'Gagal mengirim')
    } finally { setBusy(false) }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          MagangHub
        </h2>
        <span className="flex-1" />
        <StatusPill status={connKey} label={connLabel} />
        {sentAt && expanded && <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>Tutup</Button>}
        <TokenDialog connected={!!mh.token} onDisconnect={mh.disconnect} />
      </div>
      {sentAt && !expanded ? (
        <div className="mt-1 flex items-center gap-2 text-[13px]">
          <CheckCircle2 className="size-4 shrink-0 text-success-ink" aria-hidden />
          <span>Terkirim {sentAt}</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>Lihat</Button>
        </div>
      ) : (<>
      <p className="mb-3 mt-0.5 text-[13px] text-muted-foreground">
        Log harian{mh.expiry ? ` · token berlaku sampai ${hhmm(mh.expiry)}` : ''}
      </p>
      <form onSubmit={submit}>
        <div className="grid grid-cols-2 gap-x-2.5 sm:grid-cols-3">
          <div className="mb-2.5 space-y-1">
            <Label htmlFor="mh-date" className={LABEL}>Tanggal</Label>
            <Input id="mh-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="mb-2.5 space-y-1">
            <Label htmlFor="mh-status" className={LABEL}>Status</Label>
            <Input id="mh-status" value="Hadir" readOnly aria-readonly className={READ_ONLY} />
          </div>
          <div className="col-span-2 mb-2.5 space-y-1 sm:col-span-1">
            <Label htmlFor="mh-loc" className={LABEL}>Lokasi</Label>
            <Input id="mh-loc" value="Surabaya" readOnly aria-readonly className={READ_ONLY} />
          </div>
        </div>
        {FIELDS.map(([k, name]) => {
          const s = fieldState(v[k])
          return (
            <div key={k} className="mb-2.5 space-y-1">
              <Label htmlFor={`mh-${k}`} className={LABEL}>{name}</Label>
              <Textarea id={`mh-${k}`} rows={2} className="min-h-[70px]" value={v[k]} disabled={!!sentAt}
                onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              <p aria-live="polite" className={`text-xs tabular-nums ${s.ok ? 'text-success-ink' : s.count ? 'text-warning-ink' : 'text-muted-foreground'}`}>
                {s.ok ? `✓ ${s.count} karakter` : s.count ? `${s.count} / ${MIN_CHARS} karakter · kurang ${s.missing}` : `0 / ${MIN_CHARS} karakter`}
              </p>
              {fieldErr[k] && <p className="text-xs text-destructive-ink">{fieldErr[k]}</p>}
            </div>
          )
        })}
        {formErr && <div role="alert" className="mb-2.5 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive-ink">{formErr}</div>}
        <div className="flex items-center gap-2.5">
          {sentAt ? (
            <StatusPill status="closed" label={`Terkirim ${sentAt}`} />
          ) : (
            <>
              {left > 0 && <span className="text-xs text-muted-foreground">Lengkapi {left} isian lagi</span>}
              <span className="flex-1" />
              <Button type="submit" disabled={busy || left > 0}>Kirim log</Button>
            </>
          )}
        </div>
      </form>
      </>)}
    </section>
  )
}
