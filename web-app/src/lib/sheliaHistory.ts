import { fmtTime } from './attendance'

export interface HistoryRow { date: string; shift: string; checkIn: string; checkOut: string; status: 'hadir' | 'terlambat' | 'belum' | 'berjalan' }

const KEY = 'shelia.history'
const MAX_DAYS = 400

export function readHistory(): HistoryRow[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export function recordToday(today: any): void {
  const date = today?.work_date
  if (typeof date !== 'string' || !date) return
  const list = Array.isArray(today.sessions) ? today.sessions : []
  const s = list[list.length - 1]
  const prev = readHistory().find((r) => r.date === date)
  const row: HistoryRow = {
    date,
    shift: s?.shift?.name || prev?.shift || '-',
    checkIn: fmtTime(s?.check_in_time, date),
    checkOut: fmtTime(s?.check_out_time, date),
    status: !s ? 'belum' : s.status === 'late' || today.status === 'late' ? 'terlambat' : s.state === 'open' ? 'berjalan' : 'hadir',
  }
  const rows = readHistory().filter((r) => r.date !== date)
  rows.push(row)
  rows.sort((a, b) => b.date.localeCompare(a.date))
  try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_DAYS))) } catch { /* penuh/diblokir */ }
}

/** Shelia mengembalikan shift: null di sesi; simpan nama shift yang dipilih saat check-in. */
export function rememberShift(date: string, shift: string): void {
  if (!date || !shift) return
  const rows = readHistory()
  const row = rows.find((r) => r.date === date)
  if (row) row.shift = shift
  else rows.unshift({ date, shift, checkIn: '-', checkOut: '-', status: 'belum' })
  try { localStorage.setItem(KEY, JSON.stringify(rows)) } catch { /* penuh/diblokir */ }
}
