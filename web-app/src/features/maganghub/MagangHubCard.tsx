import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtDate } from './LogDetailSheet'
import { MIN_CHARS, fetchMyToday, fieldState, remainingFields, todayWIB } from '@/lib/dailyLog'
import { sendBookmarkletHref, sendUrl } from '@/lib/sendBookmarklet'
import { StatusPill } from '@/features/shelia/Sessions'
import { LocationPicker, OFFICE } from './LocationPicker'
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
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [point, setPoint] = useState(OFFICE)
  const [confirming, setConfirming] = useState(false)
  const [waiting, setWaiting] = useState(false) // MagangHub tab opened; the send happens there
  // React 19 blocks javascript: hrefs set as props, so set it on the node.
  const sendBookmarkRef = useCallback((el: HTMLAnchorElement | null) => el?.setAttribute('href', sendBookmarkletHref()), [])

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

  // The log is sent from MagangHub's own page (bookmark "→ Kirim log"), so here we only prepare and open it.
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!left) setConfirming(true)
  }

  function openMagangHub() {
    window.open(sendUrl({ date, ...v, latitude: point.lat, longitude: point.lng }), '_blank', 'noopener')
    setConfirming(false)
    setWaiting(true)
  }

  // Back from the MagangHub tab: look again whether the log arrived.
  useEffect(() => {
    if (!waiting) return
    const again = () => { if (document.visibilityState === 'visible') void check().then((r) => { if (r) setWaiting(false) }) }
    window.addEventListener('focus', again)
    document.addEventListener('visibilitychange', again)
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again) }
  }, [waiting]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="grid grid-cols-2 gap-x-2.5">
          <div className="mb-2.5 space-y-1">
            <Label htmlFor="mh-date" className={LABEL}>Tanggal</Label>
            <Input id="mh-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
              {waiting ? <span role="status" className="text-xs text-primary-ink">Kirim dari tab MagangHub dengan bookmark → Kirim log</span>
                : left > 0 && <span className="text-xs text-muted-foreground">Lengkapi {left} isian lagi</span>}
              <span className="flex-1" />
              <Button type="submit" disabled={left > 0}>Kirim log</Button>
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
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>
              Sekali saja: seret{' '}
              <a ref={sendBookmarkRef} onClick={(e) => e.preventDefault()}
                className="inline-flex rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">→ Kirim log</a>
              {' '}ke bookmark bar.
            </li>
            <li>Klik <b>Buka MagangHub</b>. Kalau diminta login, login dulu lalu klik lagi.</li>
            <li>Di tab MagangHub, klik bookmark <b>→ Kirim log</b> lalu konfirmasi.</li>
          </ol>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Batal</Button>
            <Button onClick={openMagangHub}>Buka MagangHub</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>)}
    </section>
  )
}
