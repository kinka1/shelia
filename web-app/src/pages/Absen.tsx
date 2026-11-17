import { useState } from 'react'
import { CheckCircle2, CircleDashed, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MagangHubCard } from '@/features/maganghub/MagangHubCard'
import { SheliaCard, sheliaDone } from '@/features/shelia/SheliaCard'
import { useToday } from '@/features/shelia/useToday'
import { useSession } from '@/features/session/SessionProvider'
import LoginPage from '@/features/session/LoginPage'
import { fmtTime } from '@/lib/attendance'
import { cn } from '@/lib/utils'

type Tone = 'done' | 'partial' | 'todo'
type Item = { name: string; tone: Tone; value: string; action?: string; target: string }

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

export function sheliaItem(today: any, loading: boolean, loggedIn = true): Item | null {
  if (!loggedIn) return { name: 'Shelia', tone: 'todo', value: 'Belum login', action: 'Login', target: 'form-shelia' }
  if (!today) return loading ? null : { name: 'Shelia', tone: 'todo', value: 'Status belum dimuat', target: 'form-shelia' }
  const s: any[] = Array.isArray(today.sessions) ? today.sessions : []
  const last = s[s.length - 1]
  const inAt = fmtTime(last?.check_in_time, last?.work_date)
  const outAt = fmtTime(last?.check_out_time, last?.work_date)
  if (!sheliaDone(today)) return { name: 'Shelia', tone: 'todo', value: 'Belum masuk', action: 'Check-in sekarang', target: 'form-shelia' }
  const late = today.status === 'late' ? ' (terlambat)' : ''
  if (today.next_action === 'check_out')
    return { name: 'Shelia', tone: 'partial', value: `Sudah masuk ${inAt}${late}`, action: 'Check-out', target: 'form-shelia' }
  return { name: 'Shelia', tone: 'done', value: `Masuk ${inAt}${outAt !== '-' ? ` · pulang ${outAt}` : ''}${late}`, target: 'form-shelia' }
}

export function mhItem(sentAt: string | null, connected: boolean): Item {
  if (sentAt) return { name: 'MagangHub', tone: 'done', value: `Terkirim ${sentAt}`, target: 'form-maganghub' }
  if (!connected) return { name: 'MagangHub', tone: 'todo', value: 'Belum terhubung', action: 'Hubungkan', target: 'form-maganghub' }
  return { name: 'MagangHub', tone: 'todo', value: 'Belum diisi', action: 'Isi log', target: 'form-maganghub' }
}

function TodayStatus({ shelia, mh, loading }: { shelia: Item | null; mh: Item; loading: boolean }) {
  const items = shelia ? [shelia, mh] : null
  const n = items ? items.filter((i) => i.tone === 'done').length : 0
  const next = items?.find((i) => i.action)
  const date = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(Date.now())

  // One white card: header, then the two statuses side by side, split by a divider (no inner cards).
  return (
    <Card aria-labelledby="status-title" className="gap-0 p-0 shadow-none">
      <section aria-live="polite">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-4">
          <h1 id="status-title" className="text-[15px] font-semibold">Status absen hari ini</h1>
          <span className="text-[13px] text-muted-foreground">{date}</span>
          <span className="flex-1" />
          {items && <span className="text-xs font-semibold text-muted-foreground">{n} dari 2 selesai</span>}
        </div>
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {!items
            ? [0, 1].map((i) => <div key={i} className="px-5 py-4"><Skeleton className="h-14 w-full" /></div>)
            : items.map((it) => {
                const t = TONE[it.tone]
                return (
                  <div key={it.name} className="flex items-center gap-3 px-5 py-4">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', t.ring)}>
                      <t.icon className={cn('size-[18px]', t.ink)} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{it.name}</p>
                      <p className={cn('text-base font-semibold leading-snug', t.ink)}>{it.value}</p>
                    </div>
                    {it.action && (
                      <Button size="sm" variant={it === next ? 'default' : 'outline'} className="h-8" onClick={() => goTo(it.target)}>
                        {it.action}
                      </Button>
                    )}
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
  const { token } = useSession()
  const shelia = useToday(!!token)
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [mhConnected, setMhConnected] = useState(false)
  return (
    <div className="space-y-5">
      <TodayStatus shelia={sheliaItem(shelia.today, shelia.loading, !!token)} mh={mhItem(sentAt, mhConnected)} loading={!!token && shelia.loading} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card id="form-shelia" className="scroll-mt-20 p-5 shadow-none">{token ? <SheliaCard {...shelia} /> : <LoginPage />}</Card>
        <Card id="form-maganghub" className="scroll-mt-20 p-5 shadow-none"><MagangHubCard onSentAt={setSentAt} onConnected={setMhConnected} /></Card>
      </div>
    </div>
  )
}
