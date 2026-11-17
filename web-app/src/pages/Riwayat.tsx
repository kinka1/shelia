import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MhStatusPill, fmtDate } from '@/features/maganghub/mhFormat'
import { useSession } from '@/features/session/SessionProvider'
import { todayWIB } from '@/lib/dailyLog'
import { BUCKET, MH_BUCKET, bucketOf, fetchMhMonth, fetchSheliaMonth, monthCounts, monthDays, weekday, type Bucket, type MhBucket, type SheliaRow } from '@/lib/riwayat'
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

// Each day is split in two equal halves: top = Shelia, bottom = MagangHub. Same colour language for
// both (green good, yellow waiting/late, red problem, grey nothing recorded); written out in full so
// Tailwind finds them.
const TOP: Record<Bucket, string> = {
  hadir: 'bg-success/15 text-success-ink dark:bg-success/20',
  terlambat: 'bg-warning/20 text-warning-ink dark:bg-warning/25',
  izin: 'bg-info/15 text-info-ink dark:bg-info/20',
  cuti: 'bg-info/15 text-info-ink dark:bg-info/20',
  dinas: 'bg-info/15 text-info-ink dark:bg-info/20',
  tidak_hadir: 'bg-destructive/15 text-destructive-ink dark:bg-destructive/20',
  kosong: 'bg-muted text-muted-foreground',
  belum: 'text-muted-foreground',
  nanti: 'text-muted-foreground',
  libur: 'font-normal text-muted-foreground',
}
const BOTTOM: Record<MhBucket, [string, string]> = { // [fill, glyph so it never relies on colour alone]
  disetujui: ['bg-success/40 text-success-ink dark:bg-success/35', '✓'],
  menunggu: ['bg-warning/45 text-warning-ink dark:bg-warning/35', '…'],
  ditolak: ['bg-destructive/35 text-destructive-ink dark:bg-destructive/35', '✕'],
  belum_kirim: ['bg-muted text-muted-foreground', '–'],
}
// Izin, Cuti and Dinas share a colour, so the legend names them once.
const SHELIA_LEGEND: [Bucket, string][] = [['hadir', 'Hadir'], ['terlambat', 'Terlambat'], ['izin', 'Izin/Cuti/Dinas'], ['tidak_hadir', 'Tidak hadir']]
const SHELIA_IF_SHOWN: Bucket[] = ['kosong', 'belum'] // only when the month has such a day
const MH_LEGEND: MhBucket[] = ['disetujui', 'menunggu', 'ditolak', 'belum_kirim']

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
  const mhOk = ready?.mh.status === 'ok'
  const mhShown = (n: number) => (mhOk ? n : '–')
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
                  const mh = mhOk ? d.mh : null
                  const parts = [!noShelia && `Shelia ${BUCKET[d.bucket].label}`, mh && `MagangHub ${MH_BUCKET[mh]}`].filter(Boolean)
                  const name = `${nameOf(d.date)}${parts.length ? `: ${parts.join(', ')}` : ''}`
                  return (
                    <li key={d.date} style={{ gridColumnStart: weekday(d.date) + 1 }}>
                      <button type="button" aria-label={name} title={name} aria-pressed={d.date === selected}
                        aria-current={d.date === today ? 'date' : undefined} onClick={() => setPicked(d.date)}
                        className={cn('flex aspect-square w-full flex-col overflow-hidden rounded-md border border-border text-sm font-semibold tabular-nums',
                          d.date === today && 'ring-2 ring-foreground ring-offset-1 ring-offset-card',
                          d.date === selected && 'outline outline-2 outline-offset-2 outline-primary')}>
                        <span aria-hidden className={cn('flex flex-1 items-center justify-center', !noShelia && TOP[d.bucket])}>{Number(d.date.slice(8))}</span>
                        <span aria-hidden className={cn('flex flex-1 items-center justify-center text-xs', mh && BOTTOM[mh][0])}>{mh && BOTTOM[mh][1]}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="space-y-1.5 pt-1 text-xs text-muted-foreground">
                <ul aria-label="Keterangan Shelia" className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <li className="w-32 shrink-0 whitespace-nowrap font-semibold text-foreground">Shelia (atas)</li>
                  {[...SHELIA_LEGEND, ...SHELIA_IF_SHOWN.filter((b) => days.some((d) => d.bucket === b)).map((b) => [b, BUCKET[b].label] as [Bucket, string])].map(([b, label]) => (
                    <li key={b} className="flex items-center gap-1.5">
                      <span aria-hidden className={cn('size-4 rounded-sm border border-border', TOP[b])} />{label}
                    </li>
                  ))}
                </ul>
                <ul aria-label="Keterangan MagangHub" className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <li className="w-32 shrink-0 whitespace-nowrap font-semibold text-foreground">MagangHub (bawah)</li>
                  {MH_LEGEND.map((b) => (
                    <li key={b} className="flex items-center gap-1.5">
                      <span aria-hidden className={cn('flex size-4 items-center justify-center rounded-sm border border-border text-[10px] font-semibold', BOTTOM[b][0])}>{BOTTOM[b][1]}</span>{MH_BUCKET[b]}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:min-w-0 lg:flex-1 lg:border-l lg:pl-4">
              {([
                ['Ringkasan Shelia', 'Shelia', 'Hadir', shown(counts.hadir), [['Terlambat', shown(counts.terlambat), 'text-warning-ink'], ['Tidak hadir', shown(counts.tidakHadir), 'text-destructive-ink']]],
                ['Ringkasan MagangHub', 'MagangHub', 'Terkirim', mhShown(counts.logs), [['Disetujui', mhShown(counts.disetujui), 'text-success-ink'], ['Ditolak', mhShown(counts.ditolak), 'text-destructive-ink']]],
              ] as const).map(([group, head, main, n, rest]) => (
                <div key={group} role="group" aria-label={group} className="flex min-w-0 flex-col gap-3">
                  <h3 className="text-xs font-semibold">{head}</h3>
                  <dl className="flex flex-col gap-3">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">{main}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{n} dari {counts.workDays} hari kerja</dd>
                  </div>
                  {rest.map(([label, v, ink]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 border-t pt-3">
                      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                      <dd className={cn('text-lg font-semibold tabular-nums', typeof v === 'number' && v > 0 ? ink : 'text-foreground')}>{v}</dd>
                    </div>
                  ))}
                  </dl>
                </div>
              ))}
              <p className="col-span-2 border-t pt-3 text-xs text-muted-foreground">Hari kerja Senin–Jumat sampai hari ini.</p>
            </div>
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
