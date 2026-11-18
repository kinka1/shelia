import { CONFIG, jitter } from './shelia'

export const STATUS_LABEL: Record<string, string> = {
  not_checked_in: 'Belum masuk',
  checked_in: 'Sudah masuk',
  late: 'Terlambat',
}
const REVIEW_REASON_LABEL: Record<string, string> = {
  face_recognition_bypass: 'bypass verifikasi wajah',
  outside_location: 'di luar area',
  location_missing: 'lokasi kosong',
  app_unverified: 'aplikasi tidak terverifikasi',
}
// Error yang berarti status di server sudah berubah: muat ulang user/today.
export const RELOAD_CODES = new Set([
  'ERR-HR-019', 'ERR-HR-074', 'ERR-HR-075', 'ERR-HR-020', 'ERR-HR-041', 'ERR-HR-076', 'ERR-HR-027',
])

export interface TimedToken { token: string; expiresAt: number }

export const tokenUsable = (t: TimedToken | null, now: number): boolean => !!t && t.expiresAt - now > 15_000

export function currentStep(a: {
  needShift: boolean; shiftId: string; faceOn: boolean; hasPhoto: boolean; faceToken: TimedToken | null; now: number
}): 1 | 2 | 3 {
  if (a.needShift && !a.shiftId) return 1
  if (a.faceOn && !a.hasPhoto && !tokenUsable(a.faceToken, a.now)) return 2
  return 3
}

export function buildAttendForm(a: {
  isIn: boolean; shiftId?: string; attendanceId?: string; reason?: string
  faceToken?: string; bypassToken?: string; photo?: Blob; photoName?: string
}): FormData {
  const f = new FormData()
  const at = jitter({ lat: CONFIG.LAT, lng: CONFIG.LNG })
  f.append('lat', String(at.lat))
  f.append('lng', String(at.lng))
  f.append('platform', 'web')
  if (a.shiftId) f.append('shift_id', a.shiftId)
  if (!a.isIn && a.attendanceId) f.append('attendance_id', a.attendanceId)
  if (a.reason) f.append('reason', a.reason)
  if (a.bypassToken && a.photo) {
    f.append('face_bypass_token', a.bypassToken)
    f.append('file_photo', a.photo, a.photoName)
  } else if (a.faceToken) {
    f.append('face_token', a.faceToken)
  }
  return f
}

export function shiftLabel(s: any): string {
  const hhmm = (t: unknown) => (typeof t === 'string' ? t.slice(0, 5) : '?')
  return `${s.name} (masuk ${hhmm(s.check_in_start)}-${hhmm(s.check_in_end)}, pulang ${hhmm(s.check_out_start)}-${hhmm(s.check_out_end)})`
}

// "2026-11-16 07:52:00" -> "07:52", atau "17/11 01:10" bila beda tanggal dengan workDate.
export function fmtTime(v: unknown, workDate?: string): string {
  if (!v || typeof v !== 'string') return '-'
  const date = v.slice(0, 10)
  const time = v.slice(11, 16)
  if (workDate && date !== workDate) return `${date.slice(8, 10)}/${date.slice(5, 7)} ${time}`
  return time
}

export function fmtMeters(m: unknown): string {
  const n = Number(m)
  if (!Number.isFinite(n)) return '-'
  return n >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${Math.round(n)} m`
}

export function reviewReasons(v: unknown): string {
  if (!v) return '-'
  return String(v).split(',').map((r) => REVIEW_REASON_LABEL[r.trim()] || r.trim()).join(', ')
}

export function successText(isIn: boolean, res: any): string {
  const d = res?.data || {}
  const part = isIn ? d.check_in : d.check_out
  const time = isIn ? part?.check_in_time : part?.check_out_time
  const fallback = isIn ? 'Check-in berhasil' : 'Check-out berhasil'
  let msg = `${typeof res?.message === 'string' ? res.message : fallback}${time ? ` (${time})` : ''}.`
  if (part?.status === 'late') msg += '\nStatus: terlambat.'
  if (part?.status === 'early') msg += '\nStatus: pulang lebih awal.'
  if (d.needs_hr_review) msg += `\nAbsen ini menunggu pemeriksaan HR: ${reviewReasons(d.hr_review_reason)}.`
  return msg
}
