import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtDate } from './LogDetailSheet'
import { MIN_CHARS, fetchMyToday, fieldState, remainingFields, todayWIB } from '@/lib/dailyLog'
import { extError, extSend, sendBody, useExtension } from '@/lib/extension'
import { toast } from 'sonner'
import { StatusPill } from '@/features/shelia/Sessions'
import { LocationPicker, OFFICE } from './LocationPicker'
import { MhConnect } from './MhConnect'
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
  const date = todayWIB() // locked to today, like MagangHub's own form
  const [v, setV] = useState<Record<Key, string>>({ activity_log: '', lesson_learned: '', obstacles: '' })
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [point, setPoint] = useState(OFFICE)
  const [confirming, setConfirming] = useState(false)
  const ext = useExtension()
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')

  const seq = useRef(0)
  async function check(d = date) {
    const id = ++seq.current
    const r = await fetchMyToday(d)
    if (id !== seq.current) return r // ada pengecekan yang lebih baru: jawaban lama dibuang
    setSentAt(r?.sentAt ?? null)
    if (d === todayWIB()) onSentAt?.(r?.sentAt ?? null)
    return r
  }
  useEffect(() => { void check() }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const left = remainingFields(v)
  // The token is what proves this is your MagangHub account, so no token, no send.
  const canSend = !!ext.version && mh.status === 'ok'
  const [connKey, connLabel] = CONN[mh.status]

  // Kirim log only opens the confirmation; the extension sends from MagangHub's own page.
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!left && canSend) { setSendErr(''); setConfirming(true) }
  }

  // With the extension: one click, sent from a MagangHub tab it manages.
  async function sendViaExtension() {
    if (sending) return
    setSending(true); setSendErr('')
    const r = await extSend(sendBody({ date, ...v, latitude: point.lat, longitude: point.lng }))
    setSending(false)
    if ('ok' in r && r.ok) { setConfirming(false); toast.success('Log harian terkirim ke MagangHub'); void check(); return }
    setSendErr(extError(r))
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
        <MhConnect installed={!!ext.version} onRefresh={mh.refresh} />
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
        <div className="grid grid-cols-2 gap-x-2.5">
          <div className="mb-2.5 space-y-1">
            <Label htmlFor="mh-date" className={LABEL}>Tanggal</Label>
            <Input id="mh-date" value={fmtDate(date)} readOnly aria-readonly className={READ_ONLY} />
          </div>
          <div className="mb-2.5 space-y-1">
            <Label htmlFor="mh-status" className={LABEL}>Status</Label>
            <Input id="mh-status" value="Hadir" readOnly aria-readonly className={READ_ONLY} />
          </div>
        </div>
        <LocationPicker value={point} onChange={setPoint} disabled={!!sentAt} />
        {FIELDS.map(([k, name]) => {
          const s = fieldState(v[k])
          return (
            <div key={k} className="mb-2.5 space-y-1">
              <Label htmlFor={`mh-${k}`} className={LABEL}>{name} <span className="text-destructive-ink" aria-hidden>*</span></Label>
              <Textarea id={`mh-${k}`} aria-required rows={2} className="min-h-[70px]" value={v[k]} disabled={!!sentAt}
                onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              <p aria-live="polite" className={`text-xs tabular-nums ${s.ok ? 'text-success-ink' : s.count ? 'text-warning-ink' : 'text-muted-foreground'}`}>
                {s.ok ? `✓ ${s.count} karakter` : s.count ? `${s.count} / ${MIN_CHARS} karakter · kurang ${s.missing}` : `0 / ${MIN_CHARS} karakter`}
              </p>
            </div>
          )
        })}
        <div className="flex items-center gap-2.5">
          {sentAt ? (
            <StatusPill status="closed" label={`Terkirim ${sentAt}`} />
          ) : (
            <>
              {!canSend ? <span className="text-xs text-warning-ink">{!ext.version ? 'Pasang ekstensi dulu' : mh.status === 'expired' ? 'Token kedaluwarsa, perbarui dulu' : 'Sambungkan MagangHub dulu'}</span>
                : left > 0 && <span className="text-xs text-muted-foreground">Lengkapi {left} isian lagi</span>}
              <span className="flex-1" />
              <Button type="submit" disabled={left > 0 || !canSend}>Kirim log</Button>
            </>
          )}
        </div>
      </form>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kirim lewat MagangHub</DialogTitle>
            <DialogDescription>Log dikirim dari halaman MagangHub di browser Anda, bukan dari server ini. Setelah terkirim, tidak bisa dibatalkan dari sini.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Tanggal</dt><dd>{fmtDate(date)}</dd>
            <dt className="text-muted-foreground">Kehadiran</dt><dd>Hadir</dd>
            <dt className="text-muted-foreground">Titik</dt><dd className="break-all tabular-nums">{point.lat}, {point.lng}</dd>
          </dl>
          <div className="max-h-[40vh] space-y-3 overflow-y-auto rounded-md border p-3">
            {FIELDS.map(([k, name]) => (
              <section key={k}>
                <h3 className="text-xs font-semibold text-muted-foreground">{name}</h3>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{v[k].trim()}</p>
              </section>
            ))}
          </div>
          {sendErr && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive-ink">{sendErr}</p>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Batal</Button>
            <Button disabled={sending} onClick={() => void sendViaExtension()}>{sending ? 'Mengirim…' : 'Kirim ke MagangHub'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>)}
    </section>
  )
}
