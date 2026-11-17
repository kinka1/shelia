import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ListPagination } from '@/components/ListPagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusPill } from '@/features/shelia/Sessions'
import { useToday } from '@/features/shelia/useToday'
import { readHistory, type HistoryRow } from '@/lib/sheliaHistory'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return MONTHS[Number(m) - 1] ? `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}` : d
}

// StatusPill memakai kunci status sesi; dipetakan ke tint yang sama.
const STATUS: Record<HistoryRow['status'], [string, string]> = {
  hadir: ['closed', 'Hadir'],
  terlambat: ['late', 'Terlambat'],
  belum: ['', 'Belum masuk'],
  berjalan: ['open', 'Berjalan'],
}

export default function RiwayatShelia() {
  const { today, loading, reload } = useToday()
  const [rows, setRows] = useState<HistoryRow[]>(readHistory)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  // useToday merekam hari ini ke riwayat setelah memuat; baca ulang.
  useEffect(() => { setRows(readHistory()) }, [today])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? rows.filter((r) => `${fmtDate(r.date)} ${r.shift}`.toLowerCase().includes(q)) : rows
  }, [rows, query])
  const visible = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Riwayat Shelia</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Sesi absen masuk dan pulang.</p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Input
            className="h-9 max-w-[260px] flex-1" placeholder="Cari tanggal atau shift…" aria-label="Cari tanggal atau shift"
            value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          />
          <span className="flex-1" />
          <Button variant="outline" className="h-9" disabled={loading} onClick={() => void reload('Muat riwayat Shelia')}>
            <RefreshCw className="size-4" aria-hidden /> Muat ulang
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              {['Tanggal', 'Shift', 'Masuk', 'Pulang', 'Status'].map((h) => <TableHead key={h}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada riwayat.</TableCell></TableRow>
            ) : visible.map((r) => (
              <TableRow key={r.date}>
                <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(r.date)}</TableCell>
                <TableCell>{r.shift}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{r.checkIn}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{r.checkOut}</TableCell>
                <TableCell><StatusPill status={STATUS[r.status][0]} label={STATUS[r.status][1]} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination
          page={page} perPage={perPage} total={filtered.length}
          onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1) }}
        />
      </div>
    </div>
  )
}
