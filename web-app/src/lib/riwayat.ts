// Riwayat: one month of Shelia attendance and MagangHub logs, day by day.
// Status groups are the admin panel's (admin-panel/src/pages/attendance/attendanceRecord.ts),
// so a day reads the same here as on the admin dashboard.
import { ApiError, errorText, sheliaApi } from './shelia'
import { fetchDailyLogs, type MhLog, type MhStatus } from './maganghub'

export type Bucket = 'hadir' | 'terlambat' | 'izin' | 'cuti' | 'dinas' | 'tidak_hadir' | 'belum' | 'libur' | 'kosong' | 'nanti'

export type SheliaRow = {
  attendance_date: string
  status?: string | null
  shift?: { name?: string } | null
  check_in?: { check_in_time?: string | null; status?: string | null } | null
  check_out?: { check_out_time?: string | null } | null
}

/** Label and tone (StatusPill/tint key) per bucket, like the admin panel dashboard. */
export const BUCKET: Record<Bucket, { label: string; tone: 'success' | 'warning' | 'info' | 'danger' | 'muted' | 'none' }> = {
  hadir: { label: 'Hadir', tone: 'success' },
  terlambat: { label: 'Terlambat', tone: 'warning' },
  izin: { label: 'Izin', tone: 'info' },
  cuti: { label: 'Cuti', tone: 'info' },
  dinas: { label: 'Dinas', tone: 'info' },
  tidak_hadir: { label: 'Tidak hadir', tone: 'danger' },
  belum: { label: 'Belum absen', tone: 'none' },
  libur: { label: 'Libur', tone: 'muted' },
  kosong: { label: 'Tidak ada catatan', tone: 'muted' },
  nanti: { label: 'Hari mendatang', tone: 'none' },
}

const CUTI = new Set(['leave', 'annual_leave'])
const IZIN = new Set(['day_off', 'permission', 'sick'])
const TERLAMBAT = new Set(['late', 'completedlate', 'done_late'])
const DINAS = new Set(['business_trip', 'completedtrip'])
const HADIR = new Set(['completed', 'checked_in', 'checked_out', 'pending_review', 'done', 'on_break', 'corrected', 'present'])

export function bucketOf(status?: string | null, checkInStatus?: string | null): Bucket {
  const s = (status ?? '').toLowerCase()
  if (TERLAMBAT.has(s) || (HADIR.has(s) && (checkInStatus ?? '').toLowerCase() === 'late')) return 'terlambat'
  if (HADIR.has(s)) return 'hadir'
  if (CUTI.has(s)) return 'cuti'
  if (IZIN.has(s)) return 'izin'
  if (DINAS.has(s)) return 'dinas'
  return 'tidak_hadir' // unknown or empty: the server's rule (Alpha)
}

// Order when a day has several sessions: the first one present in this list wins.
const RANK: Bucket[] = ['terlambat', 'hadir', 'dinas', 'cuti', 'izin', 'tidak_hadir']

export type CalDay = { date: string; bucket: Bucket; sessions: SheliaRow[]; log: MhLog | null }

const pad = (n: number) => String(n).padStart(2, '0')
/** 0 = Monday … 6 = Sunday, from the date parts (no time zone involved). */
export const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export function monthDays(period: string, rows: SheliaRow[], logs: MhLog[], today: string): CalDay[] {
  const [y, m] = period.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: last }, (_, i) => {
    const date = `${period}-${pad(i + 1)}`
    const sessions = rows.filter((r) => r.attendance_date?.slice(0, 10) === date)
    const log = logs.find((l) => l.date === date) ?? null
    let bucket: Bucket
    if (sessions.length) {
      const found = sessions.map((r) => bucketOf(r.status, r.check_in?.status))
      bucket = RANK.find((b) => found.includes(b))!
    } else if (weekday(date) >= 5) bucket = 'libur' // weekends without a row, as the admin calendar draws them
    else if (date > today) bucket = 'nanti'
    else if (date === today) bucket = 'belum'
    else bucket = 'kosong'
    return { date, bucket, sessions, log }
  })
}

/** Work days are Monday–Friday up to today; Hadir includes Terlambat and Dinas (as in the admin panel). */
export function monthCounts(days: CalDay[], today: string) {
  const has = (b: Bucket) => days.filter((d) => d.bucket === b).length
  return {
    hadir: has('hadir') + has('terlambat') + has('dinas'),
    workDays: days.filter((d) => d.date <= today && weekday(d.date) < 5).length,
    terlambat: has('terlambat'),
    tidakHadir: has('tidak_hadir'),
    logs: days.filter((d) => d.log).length,
  }
}

export async function fetchSheliaMonth(period: string): Promise<SheliaRow[] | { error: string }> {
  try {
    const b = await sheliaApi<{ data?: unknown }>(`/v2/attendance/user/month?month=${period}`, { action: 'Riwayat Shelia sebulan' })
    return Array.isArray(b.data) ? (b.data as SheliaRow[]) : []
  } catch (e) {
    return { error: e instanceof ApiError ? errorText(e) : 'Gagal memuat riwayat Shelia.' }
  }
}

const MAX_PAGES = 10
/** MagangHub lists newest first; pages are read until they reach the month before. */
export async function fetchMhMonth(period: string): Promise<{ status: MhStatus; logs: MhLog[]; error?: string }> {
  const logs: MhLog[] = []
  let seen = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetchDailyLogs(page, 'Riwayat MagangHub sebulan')
    if (r.status !== 'ok' || r.error) return { status: r.status, logs, ...(r.error ? { error: r.error } : {}) }
    logs.push(...r.rows.filter((l) => l.date?.startsWith(period)))
    seen += r.rows.length
    // Past the last page MagangHub repeats the last row instead of answering empty, so stop at its total.
    if ((r.total != null && seen >= r.total) || !r.rows.length || r.rows.some((l) => l.date && l.date < `${period}-01`)) return { status: 'ok', logs }
  }
  // ponytail: page cap, so an old month stops after MAX_PAGES requests; it says so instead of showing 0.
  return { status: 'ok', logs, error: 'Log yang lebih lama tidak dimuat; sebagian tanda ✓ mungkin tidak tampil.' }
}
