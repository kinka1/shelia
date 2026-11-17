import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MH_KEY, fetchDailyLogs, tokenExpiry } from './maganghub'

describe('token hand-off', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', '/') })

  it('tokenExpiry reads the JWT exp', () => {
    const p = btoa(JSON.stringify({ exp: 1795000000 })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    expect(tokenExpiry(`h.${p}.s`)).toEqual(new Date(1795000000 * 1000))
    expect(tokenExpiry('notajwt')).toBeNull()
  })

  it('fetchDailyLogs: no token means none and no fetch', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    expect((await fetchDailyLogs(1)).status).toBe('none')
    expect(f).not.toHaveBeenCalled()
  })
  it('fetchDailyLogs: 401 is expired', async () => {
    localStorage.setItem(MH_KEY, 't')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    expect((await fetchDailyLogs(1)).status).toBe('expired')
  })
  it('fetchDailyLogs: HTML body gives empty rows and an error', async () => {
    localStorage.setItem(MH_KEY, 't')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    const r = await fetchDailyLogs(1)
    expect(r.rows).toEqual([])
    expect(r.error).toBeTruthy()
  })
  it('fetchDailyLogs: non-array data gives empty rows; ok data parses', async () => {
    localStorage.setItem(MH_KEY, 't')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":{"x":1}}', { status: 200 })))
    expect((await fetchDailyLogs(1)).rows).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":[{"date":"2026-11-17"}],"total":3}', { status: 200 })))
    expect(await fetchDailyLogs(1)).toMatchObject({ status: 'ok', rows: [{ date: '2026-11-17' }], total: 3 })
  })
})

describe('fetchDailyLogs element filtering', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
  it('drops non-object elements', async () => {
    localStorage.setItem('maganghub.token', 't')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [null, 1, {}, { date: '2026-11-17' }], total: 4 }))))
    expect((await fetchDailyLogs(1)).rows).toEqual([{}, { date: '2026-11-17' }])
  })
  it('coerces odd field types to strings', async () => {
    localStorage.setItem('maganghub.token', 't')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ date: '2026-11-17', clock_in: { x: 1 }, activity_log: 5, status: null }] }))))
    expect((await fetchDailyLogs(1)).rows).toEqual([{ date: '2026-11-17', clock_in: '', activity_log: '5', status: '' }])
  })
  it('reads the real MagangHub row shape: sent time from created_at, status from review state', async () => {
    localStorage.setItem('maganghub.token', 't')
    const row = { id: 1, created_at: '2026-11-16T14:52:06.95571', date: '2026-11-16', activity_log: 'a', lesson_learned: 'b', obstacles: 'c', state: 'APPROVED' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [row], page: 1, page_size: 10, total: 1 }))))
    expect((await fetchDailyLogs(1)).rows[0]).toMatchObject({ clock_in: '14:52', status: 'APPROVED' })
  })
})
