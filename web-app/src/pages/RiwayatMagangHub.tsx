import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { ListPagination } from '@/components/ListPagination'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LogDetailSheet, MhStatusPill, fmtDate } from '@/features/maganghub/LogDetailSheet'
import { fetchDailyLogs, type MhLog } from '@/lib/maganghub'

type Result = Awaited<ReturnType<typeof fetchDailyLogs>>

const Clamp = ({ text }: { text?: string }) => <TableCell className="align-top"><p className="line-clamp-2 break-words">{text || '-'}</p></TableCell>

const Notice = ({ title }: { title: string }) => (
  <div className="space-y-3 py-10 text-center">
    <p className="font-medium">{title}</p>
    <Button asChild variant="outline" className="h-9"><Link to="/">Hubungkan di halaman Absen</Link></Button>
  </div>
)

export default function RiwayatMagangHub() {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<Result | null>(null)
  const [perPage, setPerPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
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

  const rows: MhLog[] = result?.rows ?? []
  const show = (i: number) => { opener.current = i; setOpen(i) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Riwayat MagangHub</h1>
        <Button variant="outline" className="h-9" onClick={() => void load(page, 'Muat riwayat MagangHub')}>
          <RefreshCw className="size-4" aria-hidden /> Muat ulang
        </Button>
      </div>
      {result?.status === 'none' ? <Notice title="MagangHub belum terhubung" />
        : result?.status === 'expired' ? <Notice title="Token MagangHub kedaluwarsa" />
        : (
          <div className="rounded-md border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Tanggal</TableHead>
                  <TableHead className="w-20">Masuk</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  {['Aktivitas', 'Pembelajaran', 'Kendala'].map((h) => <TableHead key={h}>{h}</TableHead>)}
                  <TableHead className="w-20"><span className="sr-only">Aksi</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!result ? (
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
                    <TableCell className="align-top tabular-nums">{fmtDate(r.date)}</TableCell>
                    <TableCell className="align-top tabular-nums">{r.clock_in || '-'}</TableCell>
                    <TableCell className="align-top"><MhStatusPill status={r.status} /></TableCell>
                    <Clamp text={r.activity_log} />
                    <Clamp text={r.lesson_learned} />
                    <Clamp text={r.obstacles} />
                    <TableCell className="align-top"><Button variant="ghost" size="sm" tabIndex={-1} aria-label={`Lihat ${fmtDate(r.date)}`}>Lihat</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination
              page={page} perPage={perPage || 1} total={result?.total ?? null}
              hasNext={rows.length > 0} onPageChange={setPage}
            />
          </div>
        )}
      <LogDetailSheet
        rows={rows} index={open} onIndexChange={(i) => { opener.current = i; setOpen(i) }} onClose={() => setOpen(null)}
        returnFocus={() => (opener.current === null ? null : rowEls.current.get(opener.current) ?? null)}
      />
    </div>
  )
}
