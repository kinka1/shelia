import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MH_KEY, bookmarkletHref, fetchDailyLogs, intakeTokenFromLocation, takeTokenFromHash, tokenExpiry } from './maganghub'

const ORIGIN = 'https://test-shelia.holo.my.id'
function runBookmarklet(token: string | null, hostname = 'monev.maganghub.kemnaker.go.id') {
  const calls = { open: [] as unknown[][], alert: [] as string[] }
  const href = bookmarkletHref(ORIGIN)
  expect(href.startsWith('javascript:')).toBe(true)
  expect(href).not.toContain('#')
  const code = decodeURIComponent(href.slice('javascript:'.length))
  new Function('sessionStorage', 'window', 'alert', 'location', code)(
    { getItem: (k: string) => (k === 'monev_access_token' ? token : null) },
    { open: (...a: unknown[]) => calls.open.push(a) },
    (m: string) => calls.alert.push(m),
    { hostname },
  )
  return calls
}

describe('token hand-off', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', '/') })

  it('takes token from hash', () => {
    expect(takeTokenFromHash('#mh=abc%2B1')).toBe('abc+1')
    expect(takeTokenFromHash('')).toBeNull()
    expect(takeTokenFromHash('#x=1')).toBeNull()
  })
  it('bookmarklet reads monev_access_token and opens fragment URL', () => {
    const c = runBookmarklet('tok/1')
    expect(c.open).toEqual([[ORIGIN + '/#mh=tok%2F1', '_blank', 'noopener']])
    expect(c.alert).toEqual([])
  })
  it('bookmarklet refuses other hosts and logged-out state', () => {
    expect(runBookmarklet('tok', 'evil.example').alert).toEqual(['Buka halaman MagangHub dulu'])
    expect(runBookmarklet(null).alert).toEqual(['Login MagangHub dulu'])
  })
  it('intakeTokenFromLocation stores the token and clears the hash', () => {
    history.replaceState(null, '', '/#mh=abc%2B1')
    intakeTokenFromLocation()
    expect(localStorage.getItem(MH_KEY)).toBe('abc+1')
    expect(location.hash).toBe('')
  })
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
