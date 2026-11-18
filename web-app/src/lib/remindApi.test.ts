import { afterEach, describe, expect, it, vi } from 'vitest'
import { remindHoliday, remindMe, remindNick, remindPlatforms, remindToday } from './remindApi'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const stub = (res: Response | Error = new Response(null, { status: 204 })) => {
  const f = vi.fn(async () => { if (res instanceof Error) throw res; return res.clone() })
  vi.stubGlobal('fetch', f)
  return f
}
const call = (f: ReturnType<typeof stub>, i = 0) => {
  const [url, init] = f.mock.calls[i] as unknown as [string, RequestInit]
  return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }
}

describe('remindApi', () => {
  it('reports platforms and today with PUT', async () => {
    const f = stub()
    await remindPlatforms({ shelia: true, sheliaName: 'Bagas G' })
    await remindToday('2026-11-18', { masuk: true, log: false })
    expect(call(f, 0)).toEqual({ url: '/remind-api/me', method: 'PUT', body: { shelia: true, sheliaName: 'Bagas G' } })
    expect(call(f, 1)).toEqual({ url: '/remind-api/me/today', method: 'PUT', body: { date: '2026-11-18', masuk: true, log: false } })
  })
  it('sends nothing when no flag is true', async () => {
    const f = stub()
    await remindToday('2026-11-18', { masuk: false })
    expect(f).not.toHaveBeenCalled()
  })
  it('never throws, warns instead', async () => {
    stub(new Error('offline'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(remindPlatforms({ maganghub: true })).resolves.toBeUndefined()
    expect(await remindNick('x')).toBe(false)
    expect(await remindMe()).toBeNull()
    expect(warn).toHaveBeenCalled()
  })
  it('remindMe returns the server view, null on a non-200', async () => {
    const me = { name: 'Bagas', nick: null, shelia: true, maganghub: false, admin: false, holiday: false }
    stub(new Response(JSON.stringify(me)))
    expect(await remindMe()).toEqual(me)
    stub(new Response('bad gateway', { status: 502 }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await remindMe()).toBeNull()
  })
  it('nick and holiday', async () => {
    const f = stub()
    expect(await remindNick(null)).toBe(true)
    expect(await remindHoliday('2026-11-18', true)).toBe(true)
    expect(call(f, 0)).toEqual({ url: '/remind-api/me', method: 'PUT', body: { nick: null } })
    expect(call(f, 1)).toEqual({ url: '/remind-api/holiday', method: 'PUT', body: { date: '2026-11-18', on: true } })
  })
})
