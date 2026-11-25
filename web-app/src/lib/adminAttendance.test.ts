import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editCheckIn, listAttendance, toWib } from './adminAttendance'
import { ApiError, saveSession } from './shelia'

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const stub = (res: Response) => {
  const f = vi.fn().mockResolvedValue(res)
  vi.stubGlobal('fetch', f)
  return f
}
const sent = (f: ReturnType<typeof vi.fn>) => {
  const [url, init] = f.mock.calls[0] as [string, RequestInit]
  return { url, method: init.method, body: JSON.parse(init.body as string) }
}

beforeEach(() => saveSession('tok', {}))
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('toWib', () => {
  it('converts UTC to WIB across midnight', () => {
    expect(toWib('2026-11-17T17:30:00.000000Z')).toBe('2026-11-18 00:30')
    expect(toWib('2026-11-18 00:00:00')).toBe('2026-11-18 00:00')
    expect(toWib(null)).toBeNull()
  })
})

describe('listAttendance', () => {
  it('posts the day and maps rows', async () => {
    const f = stub(reply({ data: { data: [{
      id: 'u1', attendance_date: '2026-11-18 00:00:00', status: 'late', employee: { full_name: 'Budi' },
      check_in_record: { check_in_time: '2026-11-18T01:40:00.000000Z' }, check_out_record: null,
    }] } }))
    const rows = await listAttendance('2026-11-18', 'budi')
    const s = sent(f)
    expect(s.url).toMatch(/\/api\/admin\/attendances$/)
    expect(s.method).toBe('POST')
    expect(s.body).toEqual({ start_date: '2026-11-18', end_date: '2026-11-18', per_page: 100, search: 'budi' })
    expect(rows).toEqual([{ id: 'u1', date: '2026-11-18', name: 'Budi', checkIn: '2026-11-18 08:40', checkOut: null, status: 'late' }])
  })

  it('omits a blank search', async () => {
    const f = stub(reply({ data: { data: [] } }))
    await listAttendance('2026-11-18', '  ')
    expect(sent(f).body).not.toHaveProperty('search')
  })
})

describe('editCheckIn', () => {
  it('sends WIB time and status', async () => {
    const f = stub(reply({ status: 'success', data: {} }))
    await editCheckIn('u1', '2026-11-18 07:55', 'checked_in')
    const s = sent(f)
    expect(s.url).toMatch(/\/api\/v2\/attendance\/admin\/u1\/check-in$/)
    expect(s.method).toBe('PATCH')
    expect(s.body).toEqual({ check_in_time: '2026-11-18 07:55', status: 'checked_in' })
  })

  it('throws the Shelia error', async () => {
    stub(reply({ status: 'error', message: 'Tidak boleh', error_code: 'ERR-HR-043' }, 403))
    const err = await editCheckIn('u1', '2026-11-18 07:55', 'checked_in').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('ERR-HR-043')
  })
})
