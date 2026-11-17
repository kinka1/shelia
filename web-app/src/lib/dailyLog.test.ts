import { describe, expect, it, vi } from 'vitest'
import { fieldState, remainingFields, todayWIB } from './dailyLog'

describe('dailyLog', () => {
  it('counts trimmed characters', () => {
    expect(fieldState('x'.repeat(99) + '  ')).toEqual({ count: 99, ok: false, missing: 1 })
    expect(fieldState('x'.repeat(100)).ok).toBe(true)
  })
  it('remainingFields counts not-ok fields', () => {
    expect(remainingFields({ activity_log: 'x'.repeat(100), lesson_learned: '', obstacles: 'a' })).toBe(2)
  })
  it('todayWIB rolls over at UTC+7', () => {
    expect(todayWIB(new Date('2026-11-17T18:00:00Z'))).toBe('2026-11-18')
  })
})

describe('real MagangHub send', () => {
  const v = { date: '2026-11-17', activity_log: 'a'.repeat(100), lesson_learned: 'b'.repeat(100), obstacles: 'c'.repeat(100), latitude: -7.3, longitude: 112.7 }
  it('POSTs exactly MagangHub\'s own payload to /attendances with the MagangHub token', async () => {
    const { submitDailyLog } = await import('./dailyLog')
    localStorage.setItem('maganghub.token', 'mh-tok')
    const f = vi.fn(async () => new Response('{"data":{}}', { status: 201 }))
    vi.stubGlobal('fetch', f)
    await submitDailyLog(v)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/maganghub-api/v1/attendances')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer mh-tok')
    expect(JSON.parse(String(init.body))).toEqual({ date: '2026-11-17', status: 'PRESENT', activity_log: v.activity_log, lesson_learned: v.lesson_learned, obstacles: v.obstacles, latitude: -7.3, longitude: 112.7 })
    vi.unstubAllGlobals()
  })
  it('refuses to send without a MagangHub token', async () => {
    const { submitDailyLog } = await import('./dailyLog')
    localStorage.removeItem('maganghub.token')
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    await expect(submitDailyLog(v)).rejects.toMatchObject({ status: 401 })
    expect(f).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('fetchMyToday reads the real daily logs and takes the send time from created_at', async () => {
    const { fetchMyToday } = await import('./dailyLog')
    localStorage.setItem('maganghub.token', 'mh-tok')
    const f = vi.fn(async () => new Response(JSON.stringify({ data: [{ date: '2026-11-17', created_at: '2026-11-17T16:40:02.1' }] })))
    vi.stubGlobal('fetch', f)
    expect(await fetchMyToday('2026-11-17')).toEqual({ sentAt: '16:40' })
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe('/maganghub-api/v1/daily-logs?page=1')
    vi.unstubAllGlobals()
  })
})
