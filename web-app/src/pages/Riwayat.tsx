import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MhStatusPill, fmtDate } from '@/features/maganghub/mhFormat'
import { useSession } from '@/features/session/SessionProvider'
import { todayWIB } from '@/lib/dailyLog'
import { BUCKET, bucketOf, fetchMhMonth, fetchSheliaMonth, monthCounts, monthDays, weekday, type Bucket, type SheliaRow } from '@/lib/riwayat'
import type { MhLog, MhStatus } from '@/lib/maganghub'
import { cn } from '@/lib/utils'

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const monthTitle = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`
const shift = (p: string, by: number) => {
  const [y, m] = p.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const hhmm = (t?: string | null) => (t ? t.slice(11, 16) || '-' : '-')

// Copied from the admin panel's MonthCalendar: written out in full so Tailwind finds them.
const CELL: Record<Bucket, string> = {
  hadir: 'border-success/40 bg-success/10 text-success-ink dark:bg-success/15',
  terlambat: 'border-warning/50 bg-warning/15 text-warning-ink dark:bg-warning/20',
  izin: 'border-info/40 bg-info/10 text-info-ink dark:bg-info/15',
  cuti: 'border-info/40 bg-info/10 text-info-ink dark:bg-info/15',
  dinas: 'border-info/40 bg-info/10 text-info-ink dark:bg-info/15',
  tidak_hadir: 'border-destructive/40 bg-destructive/10 text-destructive-ink dark:bg-destructive/15',
  belum: 'border-muted-foreground/25 bg-transparent text-muted-foreground',
  nanti: 'border-muted-foreground/25 bg-transparent text-muted-foreground',
  kosong: 'border-dotted border-muted-foreground/60 bg-transparent text-muted-foreground',
  libur: 'border-transparent bg-transparent font-normal text-muted-foreground',
}
// Always the attendance words; Belum absen and Hari mendatang only when the month has such a day.
const LEGEND: Bucket[] = ['hadir', 'terlambat', 'izin', 'cuti', 'dinas', 'tidak_hadir', 'kosong', 'belum', 'nanti']
const ONLY_IF_SHOWN: Bucket[] = ['belum', 'nanti']

type Data = { period: string; shelia: SheliaRow[] | { error: string } | null; mh: { status: MhStatus; logs: MhLog[]; error?: string } }

const Notice = ({ title, link }: { title: string; link: string }) => (
  <p className="flex flex-wrap items-center gap-2 text-[13px]">
    <span className="font-medium">{title}</span>
    <Link to="/" className="font-medium text-primary-ink underline underline-offset-2">{link}</Link>
  </p>
)

/** Shelia attendance and MagangHub logs for one month, as the admin panel's month calendar. */
export default function Riwayat() {
  const { token } = useSession()
  const today = todayWIB()
  const current = today.slice(0, 7)
  const [period, setPeriod] = useState(current)
  const [data, setData] = useState<Data | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const seq = useRef(0)
  const detail = useRef<HTMLElement>(null)
  // On phones the details sit below the calendar: bring them into view when a day is picked.
  useEffect(() => { if (picked) detail.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }) }, [picked])

  useEffect(() => {
    const id = ++seq.current
    setData(null); setPicked(null)
    void Promise.all([token ? fetchSheliaMonth(period) : Promise.resolve(null), fetchMhMonth(period)]).then(([shelia, mh]) => {
      if (id === seq.current) setData({ period, shelia, mh }) // an older month's answer is dropped
    })
  }, [period, token])

  const ready = data?.period === period ? data : null
  const rows = ready && Array.isArray(ready.shelia) ? ready.shelia : []
  const days = ready ? monthDays(period, rows, ready.mh.logs, today) : []
  const counts = monthCounts(days, today)
  const noShelia = !ready || !Array.isArray(ready.shelia) // counts unknown, not zero
  const shown = (n: number) => (noShelia ? '–' : n)
  const selected = picked ?? (period === current ? today : `${period}-01`)
  const day = days.find((d) => d.date === selected)
  const title = monthTitle(period)
  const nameOf = (date: string) => `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Riwayat</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Absensi Shelia dan log MagangHub per hari.</p>
      </div>
      <section aria-labelledby="riwayat-month" className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 id="riwayat-month" className="text-[15px] font-semibold">{title}</h2>
          <span className="flex-1" />
          <Button variant="outline" size="icon" className="size-8" aria-label="Bulan sebelumnya" onClick={() => setPeriod(shift(period, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" size="icon" className="size-8" aria-label="Bulan berikutnya" disabled={period >= current} onClick={() => setPeriod(shift(period, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="outline" size="sm" disabled={period === current} onClick={() => setPeriod(current)}>Bulan ini</Button>
        </div>

        {ready && (
          <div className="mb-3 space-y-1">
            {!token && <Notice title="Shelia belum login" link="Login di halaman Absen" />}
            {ready.shelia && 'error' in ready.shelia && <p role="alert" className="text-[13px] text-destructive-ink">Shelia: {ready.shelia.error}</p>}
            {ready.mh.status === 'none' && <Notice title="MagangHub belum terhubung" link="Hubungkan di halaman Absen" />}
            {ready.mh.status === 'expired' && <Notice title="Token MagangHub kedaluwarsa" link="Perbarui di halaman Absen" />}
            {ready.mh.error && <p role="alert" className="text-[13px] text-destructive-ink">MagangHub: {ready.mh.error}</p>}
          </div>
        )}

        {!ready ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground" aria-busy="true">Memuat {title}…</p>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="w-full min-w-0 space-y-3 lg:max-w-md lg:shrink-0">
              <div aria-hidden className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => <span key={w} className="text-center text-xs font-medium text-muted-foreground">{w}</span>)}
              </div>
              <ul aria-label={`Kalender ${title}`} className="grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const name = `${nameOf(d.date)}: ${BUCKET[d.bucket].label}${d.log ? ', log MagangHub terkirim' : ''}`
                  return (
                    <li key={d.date} style={{ gridColumnStart: weekday(d.date) + 1 }}>
                      <button type="button" aria-label={name} title={name} aria-pressed={d.date === selected}
                        aria-current={d.date === today ? 'date' : undefined} onClick={() => setPicked(d.date)}
                        className={cn('relative flex aspect-square w-full items-center justify-center rounded-md border text-sm font-semibold tabular-nums',
                          CELL[d.bucket], d.date === today && 'ring-2 ring-foreground ring-offset-1 ring-offset-card',
                          d.date === selected && 'outline outline-2 outline-offset-2 outline-primary')}>
                        {Number(d.date.slice(8))}
                        {d.log && <span aria-hidden className="absolute right-0.5 top-0 text-[11px] leading-none text-success-ink">✓</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <ul aria-label="Keterangan" className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                {LEGEND.filter((b) => !ONLY_IF_SHOWN.includes(b) || days.some((d) => d.bucket === b)).map((b) => (
                  <li key={b} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden className={cn('size-4 rounded-sm border', CELL[b])} />{BUCKET[b].label}
                  </li>
                ))}
                <li className="text-xs text-muted-foreground">✓ Log MagangHub terkirim</li>
              </ul>
            </div>

            <dl className="flex flex-col gap-3 lg:min-w-0 lg:flex-1 lg:border-l lg:pl-4">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Hadir</dt>
                <dd className="text-lg font-semibold tabular-nums">{shown(counts.hadir)} dari {counts.workDays} hari kerja</dd>
              </div>
              {([['Terlambat', shown(counts.terlambat), 'text-warning-ink'], ['Tidak hadir', shown(counts.tidakHadir), 'text-destructive-ink'], ['Log MagangHub terkirim', counts.logs, 'text-success-ink']] as const).map(([label, n, ink]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-t pt-3">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className={cn('text-lg font-semibold tabular-nums', typeof n === 'number' && n > 0 ? ink : 'text-foreground')}>{n}</dd>
                </div>
              ))}
              <p className="border-t pt-3 text-xs text-muted-foreground">Hari kerja Senin–Jumat sampai hari ini.</p>
            </dl>
          </div>
        )}
      </section>

      {day && (
        <section ref={detail} aria-label={`Detail ${fmtDate(day.date)}`} className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-[15px] font-semibold">{fmtDate(day.date)} · {BUCKET[day.bucket].label}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">Shelia</h3>
              {day.sessions.length ? day.sessions.map((s, i) => (
                <dl key={i} className="grid grid-cols-[88px_1fr] gap-y-1 text-[13px]">
                  <dt className="text-muted-foreground">Shift</dt><dd>{s.shift?.name || '-'}</dd>
                  <dt className="text-muted-foreground">Masuk</dt><dd className="tabular-nums">{hhmm(s.check_in?.check_in_time)}</dd>
                  <dt className="text-muted-foreground">Pulang</dt><dd className="tabular-nums">{hhmm(s.check_out?.check_out_time)}</dd>
                  <dt className="text-muted-foreground">Status</dt><dd>{BUCKET[bucketOf(s.status, s.check_in?.status)].label}</dd>
                </dl>
              )) : <p className="text-[13px] text-muted-foreground">Tidak ada sesi.</p>}
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">MagangHub</h3>
              {day.log ? (
                <dl className="space-y-2 text-[13px]">
                  <div><dt className="sr-only">Status</dt><dd><MhStatusPill status={day.log.status} /></dd></div>
                  {([['Aktivitas', day.log.activity_log], ['Pembelajaran', day.log.lesson_learned], ['Kendala', day.log.obstacles]] as const).map(([k, v]) => (
                    <div key={k}><dt className="text-xs font-medium text-muted-foreground">{k}</dt><dd className="whitespace-pre-line break-words">{v || '-'}</dd></div>
                  ))}
                </dl>
              ) : <p className="text-[13px] text-muted-foreground">Belum ada log</p>}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
