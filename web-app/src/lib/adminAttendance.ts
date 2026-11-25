import { sheliaApi } from './shelia'

export const CHECK_IN_STATUSES = ['checked_in', 'late', 'completed', 'completedlate'] as const
export type CheckInStatus = (typeof CHECK_IN_STATUSES)[number]

export interface AdminRow {
  id: string
  date: string // YYYY-MM-DD
  name: string
  checkIn: string | null // 'YYYY-MM-DD HH:MM' WIB
  checkOut: string | null
  status: string
}

const WIB = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** Shelia sends cast datetimes as ISO UTC and plain columns as WIB text; both come back as WIB 'YYYY-MM-DD HH:MM'. */
export function toWib(s: string | null | undefined): string | null {
  if (!s) return null
  if (/(Z|[+-]\d\d:?\d\d)$/.test(s)) {
    const t = Date.parse(s.replace(/(\.\d{3})\d+/, '$1'))
    return Number.isNaN(t) ? null : WIB.format(t)
  }
  return s.replace('T', ' ').slice(0, 16)
}

export async function listAttendance(date: string, search: string): Promise<AdminRow[]> {
  const q = search.trim()
  const b = await sheliaApi<{ data?: { data?: any[] } }>('/admin/attendances', {
    method: 'POST',
    json: { start_date: date, end_date: date, per_page: 100, ...(q && { search: q }) },
    action: 'Daftar absen (admin)',
  })
  return (b.data?.data ?? []).map((r) => ({
    id: String(r.id),
    date: String(r.attendance_date ?? '').slice(0, 10),
    name: r.employee?.full_name ?? '–',
    checkIn: toWib(r.check_in_record?.check_in_time),
    checkOut: toWib(r.check_out_record?.check_out_time),
    status: String(r.status ?? ''),
  }))
}

export async function editCheckIn(id: string, at: string, status: CheckInStatus): Promise<void> {
  await sheliaApi(`/v2/attendance/admin/${encodeURIComponent(id)}/check-in`, {
    method: 'PATCH',
    json: { check_in_time: at, status },
    action: 'Ubah check-in (admin)',
  })
}
