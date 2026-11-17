import { describe, expect, it, vi } from 'vitest'
import { MH_SITE, sendBookmarkletHref, sendUrl } from './sendBookmarklet'

const log = { activity_log: 'a'.repeat(100), lesson_learned: 'b'.repeat(100), obstacles: 'c'.repeat(100) }

/** Run the bookmarklet as if clicked on a page with this hash, with fake browser globals. */
function run(hash: string, opts: { host?: string; token?: string | null; ok?: boolean; confirm?: boolean } = {}) {
  const href = sendBookmarkletHref()
  const code = decodeURIComponent(href.slice('javascript:'.length)) // browsers fully percent-decode javascript: URLs
  const calls: { url: string; init: any }[] = []
  const alerts: string[] = []
  const fetch = vi.fn(async (url: string, init: any) => { calls.push({ url, init }); return new Response(JSON.stringify({ message: 'x' }), { status: opts.ok === false ? 422 : 201 }) })
  const win = {
    location: { hostname: opts.host ?? 'monev.maganghub.kemnaker.go.id', hash, pathname: '/dashboard', search: '', reload: vi.fn() },
    sessionStorage: { getItem: () => (opts.token === undefined ? 'mh-tok' : opts.token) },
    __NUXT__: { config: { public: { buildId: 'build-1' } } },
  }
  new Function('window', 'location', 'sessionStorage', 'fetch', 'confirm', 'alert', 'history', code)(
    win, win.location, win.sessionStorage, fetch, () => opts.confirm ?? true, (m: string) => alerts.push(m), { replaceState: vi.fn() },
  )
  return { calls, alerts, fetch }
}

describe('send bookmarklet (→ Kirim log)', () => {
  it('sendUrl packs exactly MagangHub\'s payload into the fragment of its dashboard', () => {
    const u = new URL(sendUrl({ date: '2026-11-17', ...log, latitude: -7.3, longitude: 112.7 }))
    expect(u.origin + u.pathname).toBe(MH_SITE + '/dashboard')
    expect(u.search).toBe('')
    expect(JSON.parse(decodeURIComponent(u.hash.slice('#shelia-log='.length)))).toEqual({ date: '2026-11-17', status: 'PRESENT', ...log, latitude: -7.3, longitude: 112.7 })
  })

  it('POSTs MagangHub\'s own request from its page after confirm', async () => {
    const { calls } = run('#shelia-log=' + encodeURIComponent(JSON.stringify({ date: '2026-11-17', status: 'PRESENT', ...log, latitude: -7.3, longitude: 112.7 })))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].url).toBe('https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.credentials).toBe('include')
    expect(calls[0].init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer mh-tok', 'X-Frontend-Build-ID': 'build-1' })
    expect(JSON.parse(calls[0].init.body)).toEqual({ date: '2026-11-17', status: 'PRESENT', ...log, latitude: -7.3, longitude: 112.7 })
  })

  it('drops unknown keys and leaves coordinates out when absent', async () => {
    const { calls } = run('#shelia-log=' + encodeURIComponent(JSON.stringify({ date: '2026-11-17', status: 'PRESENT', ...log, location: 'Surabaya', participant_id: 'x' })))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(JSON.parse(calls[0].init.body)).toEqual({ date: '2026-11-17', status: 'PRESENT', ...log })
  })

  it('sends nothing when cancelled, on another site, without data, or with bad data', () => {
    const good = '#shelia-log=' + encodeURIComponent(JSON.stringify({ date: '2026-11-17', status: 'PRESENT', ...log }))
    expect(run(good, { confirm: false }).calls).toHaveLength(0)
    expect(run(good, { host: 'evil.example' }).calls).toHaveLength(0)
    expect(run('', {}).calls).toHaveLength(0)
    expect(run(good, { token: null }).calls).toHaveLength(0)
    expect(run('#shelia-log=' + encodeURIComponent(JSON.stringify({ date: '2026-11-17', status: 'ABSENT', ...log }))).calls).toHaveLength(0)
    expect(run('#shelia-log=' + encodeURIComponent(JSON.stringify({ date: '2026-11-17', status: 'PRESENT', ...log, obstacles: 'short' }))).calls).toHaveLength(0)
    expect(run('#shelia-log=%E0%A4%A').calls).toHaveLength(0)
  })

  it('a saved bookmark keeps the whole code (no raw #)', () => {
    expect(sendBookmarkletHref().slice('javascript:'.length)).not.toContain('#')
  })
})
