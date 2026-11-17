import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { ListPagination } from '@/components/ListPagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LogDetailSheet, MhStatusPill, fmtDate } from '@/features/maganghub/LogDetailSheet'
import { fetchDailyLogs, type MhLog } from '@/lib/maganghub'

type Result = Awaited<ReturnType<typeof fetchDailyLogs>>

const Clamp = ({ text }: { text?: string }) => <TableCell><p className="line-clamp-2 break-words leading-[1.45]">{text || '-'}</p></TableCell>

const Notice = ({ title }: { title: string }) => (
  <TableRow className="hover:bg-transparent">
    <TableCell colSpan={7} className="py-10 text-center">
      <p className="mb-3 font-medium">{title}</p>
      <Button asChild variant="outline" className="h-9"><Link to="/">Hubungkan di halaman Absen</Link></Button>
    </TableCell>
  </TableRow>
)

export default function RiwayatMagangHub() {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<Result | null>(null)
  const [perPage, setPerPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const rowEls = useRef(new Map<number, HTMLTableRowElement>())
  const opener = useRef<number | null>(null)

  const latest = useRef(0)
  const load = useCallback(async (p: number, action?: string) => {
    const id = ++latest.current
    setResult(null)
    const r = await fetchDailyLogs(p, action)
    if (id !== latest.current) return // respons lama tidak boleh menimpa halaman terbaru
    setResult(r)
    // Ukuran halaman = jumlah baris halaman pertama.
    if (p === 1 && r.rows.length) setPerPage(r.rows.length)
  }, [])
  useEffect(() => { void load(page) }, [page, load])

  const all: MhLog[] = result?.rows ?? []
  // Cari hanya di halaman yang sudah dimuat; API tidak punya pencarian.
  const needle = query.trim().toLowerCase()
  const rows = needle
    ? all.filter((r) => [r.activity_log, r.lesson_learned, r.obstacles].join(' ').toLowerCase().includes(needle))
    : all
  const show = (i: number) => { opener.current = i; setOpen(i) }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Riwayat MagangHub</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Log harian dari akun MagangHub Anda.</p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Input
            className="h-9 max-w-[260px] flex-1" placeholder="Cari aktivitas…" aria-label="Cari aktivitas"
            value={query} onChange={(e) => { setQuery(e.target.value); setOpen(null) }}
          />
          <span className="flex-1" />
          <Button variant="outline" className="h-9" onClick={() => void load(page, 'Muat riwayat MagangHub')}>
            <RefreshCw className="size-4" aria-hidden /> Muat ulang
          </Button>
        </div>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[104px]">Tanggal</TableHead>
              <TableHead className="w-[72px]">Masuk</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              {['Aktivitas', 'Pembelajaran', 'Kendala'].map((h) => <TableHead key={h}>{h}</TableHead>)}
              <TableHead className="w-[64px]"><span className="sr-only">Aksi</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result?.status === 'none' ? <Notice title="MagangHub belum terhubung" />
              : result?.status === 'expired' ? <Notice title="Token MagangHub kedaluwarsa" />
              : !result ? (
                <TableRow><TableCell colSpan={7}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
              ) : result.error ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive-ink">{result.error}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Belum ada log.</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow
                  key={i} tabIndex={0} className="cursor-pointer"
                  ref={(el) => { if (el) rowEls.current.set(i, el); else rowEls.current.delete(i) }}
                  onClick={() => show(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) show(i) }}
                >
                  <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(r.date)}</TableCell>
                  <TableCell className="tabular-nums">{r.clock_in || '-'}</TableCell>
                  <TableCell><MhStatusPill status={r.status} /></TableCell>
                  <Clamp text={r.activity_log} />
                  <Clamp text={r.lesson_learned} />
                  <Clamp text={r.obstacles} />
                  <TableCell>
                    <Button variant="ghost" size="sm" tabIndex={-1} aria-label={`Lihat ${fmtDate(r.date)}`}
                      className="h-auto p-0 text-[13px] font-semibold text-primary-ink hover:bg-transparent hover:text-primary-ink hover:underline">Lihat</Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {result?.status !== 'none' && result?.status !== 'expired' && (
          <ListPagination
            page={page} perPage={perPage || 1} total={result?.total ?? null}
            hasNext={all.length > 0 && all.length >= perPage} onPageChange={setPage}
          />
        )}
      </div>
      <LogDetailSheet
        rows={rows} index={open} onIndexChange={(i) => { opener.current = i; setOpen(i) }} onClose={() => setOpen(null)}
        returnFocus={() => (opener.current === null ? null : rowEls.current.get(opener.current) ?? null)}
      />
    </div>
  )
}
