import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSession } from '@/features/session/SessionProvider'
import { CHECK_IN_STATUSES, editCheckIn, listAttendance, type AdminRow, type CheckInStatus } from '@/lib/adminAttendance'
import { todayWIB } from '@/lib/dailyLog'
import { ApiError, errorText, isSuperadmin } from '@/lib/shelia'

const hhmm = (s: string | null) => (s ? s.slice(11, 16) : '–')
const failText = (e: unknown, fallback: string) => (e instanceof ApiError ? errorText(e) : fallback)
const Alert = ({ text }: { text: string }) => (
  <div role="alert" className="whitespace-pre-line rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{text}</div>
)

function EditDialog({ row, onClose, onSaved }: { row: AdminRow; onClose: () => void; onSaved: () => void }) {
  const [at, setAt] = useState((row.checkIn ?? `${row.date} 08:00`).replace(' ', 'T'))
  const [status, setStatus] = useState<CheckInStatus>(
    (CHECK_IN_STATUSES as readonly string[]).includes(row.status) ? (row.status as CheckInStatus) : 'checked_in')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await editCheckIn(row.id, at.replace('T', ' '), status)
      toast.success('Jam check-in diubah')
      onSaved()
    } catch (e) {
      setError(failText(e, 'Gagal mengubah check-in.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah check-in · {row.name}</DialogTitle>
          <DialogDescription>Jam dan status disimpan apa adanya, tidak dihitung ulang dari shift.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ua-at">Jam masuk</Label>
            <Input id="ua-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ua-status">Status</Label>
            <select
              id="ua-status" value={status} onChange={(e) => setStatus(e.target.value as CheckInStatus)}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              {CHECK_IN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {error && <Alert text={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={save} disabled={saving || !at}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function UbahAbsen() {
  const { employee } = useSession()
  const admin = isSuperadmin(employee)
  const [date, setDate] = useState(todayWIB)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminRow[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<AdminRow | null>(null)
  const latest = useRef(0)

  const load = useCallback(async (d: string, search: string) => {
    const n = ++latest.current
    try {
      const r = await listAttendance(d, search)
      if (n === latest.current) { setRows(r); setError('') }
    } catch (e) {
      if (n === latest.current) { setRows([]); setError(failText(e, 'Gagal memuat absen.')) }
    }
  }, [])

  useEffect(() => {
    if (!admin || !date) return
    const t = setTimeout(() => load(date, q), q ? 300 : 0)
    return () => clearTimeout(t)
  }, [admin, date, q, load])

  if (!admin) return <Navigate to="/" replace />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-[-0.02em]">Ubah Absen</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ua-date">Tanggal</Label>
          <Input id="ua-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="ua-q">Cari nama</Label>
          <Input id="ua-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama karyawan" />
        </div>
      </div>
      {error && <Alert text={error} />}
      {rows && !error && rows.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada absen di tanggal ini.</p>}
      {rows && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead><TableHead>Masuk</TableHead><TableHead>Pulang</TableHead>
              <TableHead>Status</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{hhmm(r.checkIn)}</TableCell>
                <TableCell>{hhmm(r.checkOut)}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" aria-label={`Ubah absen ${r.name}`} onClick={() => setEditing(r)}>Ubah</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && (
        <EditDialog
          key={editing.id} row={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(date, q) }}
        />
      )}
    </div>
  )
}
