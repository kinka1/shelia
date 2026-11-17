import { afterEach, describe, expect, it, vi } from 'vitest'
import manifest from '../../../extension/manifest.json'
import { ALLOWED_ORIGINS, MH_SITE, pageSend, pageToken, todayWIB, validateBody } from '../../../extension/mh.js'

const NOW = new Date('2026-11-17T20:00:00Z') // 03:00 WIB on the 18th
const T = 'x'.repeat(100)
const good = { date: '2026-11-18', status: 'PRESENT', activity_log: T, lesson_learned: T, obstacles: T }

describe('extension mh.js', () => {
  afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear() })

  it('knows MagangHub and only our origins', () => {
    expect(MH_SITE).toBe('https://monev.maganghub.kemnaker.go.id')
    expect(ALLOWED_ORIGINS).toEqual(['https://test-shelia.holo.my.id'])
    expect(manifest.externally_connectable.matches).toEqual(['https://test-shelia.holo.my.id/*'])
    expect(manifest.host_permissions).toEqual(['https://monev.maganghub.kemnaker.go.id/*', 'https://test-shelia.holo.my.id/*'])
    expect(todayWIB(NOW)).toBe('2026-11-18')
  })

  it('validateBody keeps only the allowed fields', () => {
    expect(validateBody({ ...good, location: 'Surabaya', participant_id: 'p' }, NOW)).toEqual({ body: good })
    expect(validateBody({ ...good, latitude: -7.3, longitude: 112.7 }, NOW)).toEqual({ body: { ...good, latitude: -7.3, longitude: 112.7 } })
    expect(validateBody({ ...good, latitude: -7.3 }, NOW)).toEqual({ body: good })
    expect(validateBody({ ...good, latitude: '1', longitude: 2 }, NOW)).toEqual({ body: good })
  })

  it('validateBody rejects bad input', () => {
    for (const b of [null, 'x', { ...good, date: '2026-11-17' }, { ...good, status: 'ABSENT' }, { ...good, obstacles: 'y'.repeat(99) }, { ...good, activity_log: ' '.repeat(120) }])
      expect(validateBody(b, NOW)).toHaveProperty('error')
  })

  it('pageToken returns the MagangHub token, or null after waiting', async () => {
    sessionStorage.setItem('monev_access_token', 'tok')
    expect(await pageToken(50)).toBe('tok')
    sessionStorage.clear()
    expect(await pageToken(50)).toBeNull()
  })

  it('pageSend makes MagangHub\'s own request', async () => {
    sessionStorage.setItem('monev_access_token', 'tok')
    ;(window as any).__NUXT__ = { config: { public: { buildId: 'b1' } } }
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: 'bad' }), { status: 422 }))
    vi.stubGlobal('fetch', fetch)
    expect(await pageSend(good)).toEqual({ status: 422, message: 'bad' })
    expect(fetch).toHaveBeenCalledWith('https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances', {
      method: 'POST', credentials: 'include', body: JSON.stringify(good),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok', 'X-Frontend-Build-ID': 'b1' },
    })
    delete (window as any).__NUXT__
  })
})
