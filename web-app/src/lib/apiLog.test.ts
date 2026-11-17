import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { HIDDEN } from './redact'
import { clearLog, explain, groupEntries, loggedFetch, titleFor, useApiLog, type LogEntry } from './apiLog'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
const stub = (impl: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl))
const log = () => renderHook(() => useApiLog()).result.current

beforeEach(() => {
  clearLog()
  vi.unstubAllGlobals()
})

describe('loggedFetch', () => {
  it('logs a redacted copy and leaves the body readable', async () => {
    stub(async () => json({ data: { token: 't' }, token: 't' }))
    const res = await loggedFetch('/api/auth/login', {
      action: 'Masuk', method: 'POST',
      headers: { Authorization: 'Bearer abc' }, body: JSON.stringify({ password: 'p' }),
    })
    expect(await res.json()).toEqual({ data: { token: 't' }, token: 't' })
    const [e] = log()
    expect(e).toMatchObject({ status: 200, source: 'shelia', method: 'POST', path: '/api/auth/login', action: 'Masuk', title: 'Login' })
    expect((e.resBody as { token: string }).token).toBe(HIDDEN)
    expect(e.reqBody).toEqual({ password: HIDDEN })
    expect(e.reqHeaders.Authorization).toBe(`Bearer ${HIDDEN}`)
  })

  it('classifies source by path prefix', async () => {
    stub(async () => json({}))
    for (const p of ['/api/a', '/monev-api/v1/x', '/maganghub-api/v1/x']) await loggedFetch(p, { action: 'a' })
    expect(log().map((e) => e.source)).toEqual(['maganghub', 'maganghub', 'shelia'])
  })

  it('records status null on network error and rethrows', async () => {
    stub(() => Promise.reject(new TypeError('boom')))
    await expect(loggedFetch('/api/x', { action: 'a' })).rejects.toThrow('boom')
    expect(log()[0].status).toBeNull()
  })

  it('logs non-JSON bodies as text', async () => {
    stub(async () => new Response('<html>', { status: 502 }))
    const res = await loggedFetch('/api/x', { action: 'a' })
    expect(await res.text()).toBe('<html>')
    expect(log()[0].resBody).toBe('<html>')
  })

  it('keeps only the newest 200', async () => {
    stub(async () => json({}))
    for (let i = 0; i < 201; i++) await loggedFetch(`/api/x?i=${i}`, { action: 'a' })
    const l = log()
    expect(l).toHaveLength(200)
    expect(l[0].path).toBe('/api/x?i=200')
    expect(l.some((e) => e.path === '/api/x?i=0')).toBe(false)
  })

  it('clearLog empties the store', async () => {
    stub(async () => json({}))
    await loggedFetch('/api/x', { action: 'a' })
    act(() => clearLog())
    expect(log()).toEqual([])
  })
})

const mk = (action: string, id: number): LogEntry => ({
  id, action, source: 'shelia', method: 'GET', path: '/x', title: 't', status: 200, ms: 1, at: id,
  reqHeaders: {}, reqBody: null, resHeaders: {}, resBody: null,
})

describe('groupEntries', () => {
  it('merges consecutive same-action entries and splits on change', () => {
    const g = groupEntries([mk('A', 4), mk('A', 3), mk('B', 2), mk('A', 1)])
    expect(g.map((x) => [x.action, x.entries.length])).toEqual([['A', 2], ['B', 1], ['A', 1]])
    expect(new Set(g.map((x) => x.key)).size).toBe(3)
  })

  it('keeps a group key stable when a newer entry joins it', () => {
    const before = groupEntries([mk('A', 2), mk('A', 1)])[0].key
    const after = groupEntries([mk('A', 3), mk('A', 2), mk('A', 1)])[0].key
    expect(after).toBe(before)
  })
})

describe('titleFor', () => {
  it('maps known paths, ignoring the query', () => {
    expect(titleFor('POST', '/api/auth/login')).toBe('Login')
    expect(titleFor('GET', '/api/v2/attendance/shifts/available')).toBe('Ambil daftar shift')
    expect(titleFor('GET', '/maganghub-api/v1/daily-logs?page=2')).toBe('Ambil log MagangHub')
    expect(titleFor('GET', '/monev-api/v1/daily-logs')).toBe('Cek log hari ini')
    expect(titleFor('GET', '/api/unknown')).toBe('/api/unknown')
  })
})

describe('explain', () => {
  it('explains a 422 with message and code', () => {
    const r = explain({ ...mk('a', 1), status: 422, resBody: { message: 'X', error_code: 'ERR-HR-028' } })
    expect(r).toMatchObject({ bad: true, title: 'Gagal (422)' })
    expect(r.text).toContain('X')
    expect(r.text).toContain('ERR-HR-028')
  })
  it('explains success, network error and auth failure', () => {
    expect(explain(mk('a', 1))).toEqual({ bad: false, title: 'Berhasil', text: 'Permintaan berhasil.' })
    expect(explain({ ...mk('a', 1), resBody: { message: 'Oke' } }).text).toBe('Oke')
    expect(explain({ ...mk('a', 1), status: null })).toMatchObject({ bad: true, text: 'Tidak bisa terhubung ke server.' })
    expect(explain({ ...mk('a', 1), status: 401 }).text).toBe('Sesi atau token tidak berlaku. Masuk lagi.')
  })
})
