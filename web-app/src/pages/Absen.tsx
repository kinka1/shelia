import { useState } from 'react'
import { CheckCircle2, CircleDashed, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MagangHubCard } from '@/features/maganghub/MagangHubCard'
import { SheliaCard, sheliaDone } from '@/features/shelia/SheliaCard'
import { useToday } from '@/features/shelia/useToday'
import { fmtTime } from '@/lib/attendance'
import { cn } from '@/lib/utils'

type Tone = 'done' | 'partial' | 'todo'
type Item = { name: string; tone: Tone; value: string; detail: string; action?: string; target: string }

const TONE: Record<Tone, { icon: typeof CheckCircle2; ring: string; ink: string }> = {
  done: { icon: CheckCircle2, ring: 'bg-success/10', ink: 'text-success-ink' },
  partial: { icon: Clock3, ring: 'bg-primary/10', ink: 'text-primary-ink' },
  todo: { icon: CircleDashed, ring: 'bg-warning/15', ink: 'text-warning-ink' },
}

/** Bawa pengguna ke form yang dimaksud dan fokuskan isian pertamanya. */
function goTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  el.querySelector<HTMLElement>('textarea:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true })
}

export function sheliaItem(today: any, loading: boolean): Item | null {
  if (!today) return loading ? null : { name: 'Shelia', tone: 'todo', value: 'Status belum dimuat', detail: 'Muat ulang di form Shelia.', target: 'form-shelia' }
  const s: any[] = Array.isArray(today.sessions) ? today.sessions : []
  const last = s[s.length - 1]
  const inAt = fmtTime(last?.check_in_time, last?.work_date)
  const outAt = fmtTime(last?.check_out_time, last?.work_date)
  if (!sheliaDone(today)) return { name: 'Shelia', tone: 'todo', value: 'Belum masuk', detail: today.message || 'Check-in dengan foto wajah.', action: 'Check-in sekarang', target: 'form-shelia' }
  const late = today.status === 'late' ? ' (terlambat)' : ''
  if (today.next_action === 'check_out')
    return { name: 'Shelia', tone: 'partial', value: `Sudah masuk ${inAt}${late}`, detail: 'Jangan lupa check-out saat pulang.', action: 'Check-out', target: 'form-shelia' }
  return { name: 'Shelia', tone: 'done', value: `Masuk ${inAt}${outAt !== '-' ? ` · pulang ${outAt}` : ''}${late}`, detail: 'Absen Shelia selesai untuk hari ini.', target: 'form-shelia' }
}

function TodayStatus({ shelia, sentAt, loading }: { shelia: Item | null; sentAt: string | null; loading: boolean }) {
  const mh: Item = sentAt
    ? { name: 'MagangHub', tone: 'done', value: `Terkirim ${sentAt}`, detail: 'Log harian sudah dikirim.', target: 'form-maganghub' }
    : { name: 'MagangHub', tone: 'todo', value: 'Belum diisi', detail: 'Isi Aktivitas, Pembelajaran dan Kendala.', action: 'Isi log', target: 'form-maganghub' }
  const items = shelia ? [shelia, mh] : null
  const n = items ? items.filter((i) => i.tone !== 'todo').length : 0
  const all = !!items && items.every((i) => i.tone === 'done')
  const next = items?.find((i) => i.action)
  const date = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(Date.now())
  const headline = !items ? 'Memeriksa absen hari ini…' : all ? 'Semua absen hari ini selesai' : n === 0 ? 'Kamu belum absen hari ini' : `${n} dari 2 sudah absen`

  return (
    <Card
      aria-labelledby="status-title"
      className={cn('p-5 shadow-sm sm:p-6', all ? 'border-success/40 bg-success/[0.06]' : 'border-primary/30 bg-primary/[0.04]')}
    >
      <section aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status absen · {date}</p>
        <h1 id="status-title" className="mt-1 text-2xl font-semibold tracking-[-0.02em] sm:text-[28px]">{headline}</h1>
        {next && <p className="mt-1 text-sm text-muted-foreground">Langkah berikutnya: {next.action!.toLowerCase()} di {next.name}.</p>}
        <div className="mt-4 grid grid-cols-2 gap-1.5" aria-hidden>
          {[0, 1].map((i) => (
            <span key={i} className={cn('h-1.5 rounded-full', i < n ? (all ? 'bg-success' : 'bg-primary') : 'bg-border')} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {!items
            ? [0, 1].map((i) => <Skeleton key={i} className="h-[108px] rounded-lg" />)
            : items.map((it) => {
                const t = TONE[it.tone]
                return (
                  <div key={it.name} className="flex gap-3 rounded-lg border bg-card p-4">
                    <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', t.ring)}>
                      <t.icon className={cn('size-5', t.ink)} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-muted-foreground">{it.name}</p>
                      <p className={cn('text-lg font-semibold leading-snug', t.ink)}>{it.value}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{it.detail}</p>
                      {it.action && (
                        <Button size="sm" variant={it === next ? 'default' : 'outline'} className="mt-3 h-9" onClick={() => goTo(it.target)}>
                          {it.action}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
        </div>
        {loading && items && <span className="sr-only">Memuat ulang status</span>}
      </section>
    </Card>
  )
}

export default function Absen() {
  const shelia = useToday()
  const [sentAt, setSentAt] = useState<string | null>(null)
  return (
    <div className="space-y-5">
      <TodayStatus shelia={sheliaItem(shelia.today, shelia.loading)} sentAt={sentAt} loading={shelia.loading} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card id="form-shelia" className="scroll-mt-20 p-5 shadow-none"><SheliaCard {...shelia} /></Card>
        <Card id="form-maganghub" className="scroll-mt-20 p-5 shadow-none"><MagangHubCard onSentAt={setSentAt} /></Card>
      </div>
    </div>
  )
}
