import { afterEach, describe, expect, it, vi } from 'vitest'
import { bucketOf, fetchMhMonth, fetchSheliaMonth, monthCounts, monthDays, type SheliaRow } from './riwayat'
import { saveSession } from './shelia'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })

describe('bucketOf (admin-panel status groups)', () => {
  it('groups like the admin panel', () => {
    for (const s of ['completed', 'checked_in', 'checked_out', 'pending_review', 'done', 'on_break', 'corrected', 'present']) expect(bucketOf(s)).toBe('hadir')
    for (const s of ['late', 'completedlate', 'done_late', 'Completedlate']) expect(bucketOf(s)).toBe('terlambat')
    for (const s of ['leave', 'annual_leave']) expect(bucketOf(s)).toBe('cuti')
    for (const s of ['day_off', 'permission', 'sick']) expect(bucketOf(s)).toBe('izin')
    for (const s of ['business_trip', 'completedtrip']) expect(bucketOf(s)).toBe('dinas')
    expect(bucketOf('checked_in', 'late')).toBe('terlambat')
    expect(bucketOf('weird')).toBe('tidak_hadir')
    expect(bucketOf(null)).toBe('tidak_hadir')
  })
})

const rows: SheliaRow[] = [
  { attendance_date: '2026-11-03 00:00:00', status: 'checked_out', check_in: { check_in_time: '2026-11-03 08:01:00' } },
  { attendance_date: '2026-11-04 00:00:00', status: 'checked_out' },
  { attendance_date: '2026-11-04 00:00:00', status: 'late' },
]
const logs = [{ date: '2026-11-03', status: 'PENDING', activity_log: 'a' }]

describe('monthDays', () => {
  const days = monthDays('2026-11', rows, logs, '2026-11-17')
  const day = (d: number) => days[d - 1]
  it('one entry per day; dates with a time part land on their own day', () => {
    expect(days).toHaveLength(30)
    expect(day(3)).toMatchObject({ date: '2026-11-03', bucket: 'hadir' })
    expect(day(3).sessions).toHaveLength(1)
    expect(day(3).log).toMatchObject({ activity_log: 'a' })
  })
  it('late beats present on a day with several sessions', () => expect(day(4).bucket).toBe('terlambat'))
  it('weekend, empty weekday, today and the future', () => {
    expect(day(7).bucket).toBe('libur')
    expect(day(9).bucket).toBe('kosong')
    expect(day(17).bucket).toBe('belum')
    expect(day(18).bucket).toBe('nanti')
    expect(day(4).log).toBeNull()
  })
  it('a month with no rows reads "kosong", never "tidak_hadir"', () => {
    expect(monthDays('2026-10', [], [], '2026-11-17').filter((d) => d.bucket === 'tidak_hadir')).toHaveLength(0)
  })
  it('counts: work days so far, hadir includes late, days with a log', () => {
    expect(monthCounts(days, '2026-11-17')).toEqual({ hadir: 2, workDays: 12, terlambat: 1, tidakHadir: 0, logs: 1 })
  })
})

describe('fetchSheliaMonth', () => {
  it('reads the month with the Shelia token', async () => {
    saveSession('tok', {})
    const f = vi.fn(async () => json({ status: true, data: rows }))
    vi.stubGlobal('fetch', f)
    expect(await fetchSheliaMonth('2026-11')).toEqual(rows)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v2/attendance/user/month?month=2026-11')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
  it('an error becomes { error }', async () => {
    saveSession('tok', {})
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'x' }, 500)))
    expect(await fetchSheliaMonth('2026-11')).toHaveProperty('error')
  })
})

describe('fetchMhMonth', () => {
  it('pages until logs are older than the month, keeps only that month', async () => {
    localStorage.setItem('maganghub.token', 'mh')
    const f = vi.fn(async (url: string) => json({ data: url.includes('page=1') ? [{ date: '2026-11-05' }, { date: '2026-11-02' }] : [{ date: '2026-11-01' }, { date: '2026-10-30' }] }))
    vi.stubGlobal('fetch', f)
    const r = await fetchMhMonth('2026-11')
    expect(r.status).toBe('ok')
    expect(r.logs.map((l) => l.date)).toEqual(['2026-11-05', '2026-11-02', '2026-11-01'])
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('no token → none, no request', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    expect(await fetchMhMonth('2026-11')).toEqual({ status: 'none', logs: [] })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('final review fixes', () => {
  it('Dinas days count as attended, as in the admin panel', () => {
    const d = monthDays('2026-11', [{ attendance_date: '2026-11-03 00:00:00', status: 'business_trip' }], [], '2026-11-17')
    expect(monthCounts(d, '2026-11-17').hadir).toBe(1)
  })
  it('an undated MagangHub row does not stop paging; hitting the page cap says logs may be missing', async () => {
    localStorage.setItem('maganghub.token', 'mh')
    const f = vi.fn(async (url: string) => json({ data: url.endsWith('page=1') ? [{ date: '2026-11-05' }, { }] : [{ date: '2026-11-04' }] }))
    vi.stubGlobal('fetch', f)
    const r = await fetchMhMonth('2026-11')
    expect(r.logs.map((l) => l.date)).toContain('2026-11-04')
    expect(f).toHaveBeenCalledTimes(10)
    expect(r.error).toBe('Log yang lebih lama tidak dimuat; sebagian tanda ✓ mungkin tidak tampil.')
  })
})

describe('MagangHub paging, as the real API answers', () => {
  it('stops at the total: past the last page the API repeats the last row', async () => {
    localStorage.setItem('maganghub.token', 'mh')
    const f = vi.fn(async () => json({ data: [{ date: '2026-11-16' }], page: 1, page_size: 10, total: 1 }))
    vi.stubGlobal('fetch', f)
    const r = await fetchMhMonth('2026-11')
    expect(r).toEqual({ status: 'ok', logs: [expect.objectContaining({ date: '2026-11-16' })] })
    expect(f).toHaveBeenCalledTimes(1)
  })
})
