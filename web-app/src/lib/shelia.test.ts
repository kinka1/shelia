import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, errorText, getToken, onUnauthorized, saveSession, sheliaApi } from './shelia'

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('sheliaApi', () => {
  it('sends bearer token, language and json body', async () => {
    saveSession('tok', {})
    const f = vi.fn().mockResolvedValue(reply({ data: 1 }))
    vi.stubGlobal('fetch', f)
    await sheliaApi('/x', { method: 'POST', json: { a: 1 }, action: 'T' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/x')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Accept-Language': 'id' })
    expect(init.body).toBe('{"a":1}')
  })

  it('throws ApiError with the server code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ status: 'error', message: 'M', error_code: 'E' }, 200)))
    await expect(sheliaApi('/x', { action: 'T' })).rejects.toMatchObject({ message: 'M', code: 'E' })
  })

  it('maps a fetch rejection to NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    await expect(sheliaApi('/x', { action: 'T' })).rejects.toMatchObject({
      code: 'NETWORK',
      message: 'Tidak bisa terhubung ke server. Periksa koneksi internet.',
    })
  })

  it('clears the session and notifies on 401 with auth', async () => {
    saveSession('tok', {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ message: 'no' }, 401)))
    const cb = vi.fn()
    const off = onUnauthorized(cb)
    await expect(sheliaApi('/x', { action: 'T' })).rejects.toBeInstanceOf(ApiError)
    off()
    expect(getToken()).toBeNull()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('does not notify on 401 without auth (login failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ message: 'no' }, 401)))
    const cb = vi.fn()
    const off = onUnauthorized(cb)
    await expect(sheliaApi('/x', { auth: false, action: 'T' })).rejects.toBeInstanceOf(ApiError)
    off()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('errorText', () => {
  it('joins field errors, attempts and retry-after', () => {
    const e = new ApiError('Gagal', {
      code: 'ERR-1',
      errors: { a: ['satu', 'dua'], b: [{ message: 'tiga' }] },
      meta: { attempts_remaining: 2 },
      retryAfter: '30',
    })
    expect(errorText(e)).toBe(
      'Gagal (ERR-1)\nsatu\ndua\ntiga\nSisa percobaan verifikasi wajah: 2.\nCoba lagi dalam 30 detik.',
    )
  })
  it('omits NETWORK code', () => {
    expect(errorText(new ApiError('Putus', { code: 'NETWORK' }))).toBe('Putus')
  })

  it('an expired Shelia login clears only Shelia, not the MagangHub token or history', async () => {
    localStorage.setItem('maganghub.token', 'mh'); localStorage.setItem('shelia.history', '[]')
    saveSession('t', { full_name: 'B' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await expect(sheliaApi('/x', { action: 'a' })).rejects.toBeTruthy()
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('maganghub.token')).toBe('mh')
    expect(localStorage.getItem('shelia.history')).toBe('[]')
    vi.unstubAllGlobals()
  })
})
