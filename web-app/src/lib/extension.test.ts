import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXT_ID, extAvailable, extSend, extToken } from './extension'
import { stubExt } from '@/test/ext'

describe('extension bridge', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is not available without chrome.runtime', async () => {
    expect(await extAvailable()).toBeNull()
    expect(await extToken(true)).toEqual({ error: 'missing' })
  })

  it('reports the installed version and talks to our fixed ID', async () => {
    const send = stubExt((m) => (m.type === 'hello' ? { ok: true, version: '1.0.0' } : { ok: true, token: 't' }))
    expect(await extAvailable()).toEqual({ version: '1.0.0' })
    expect(await extToken(false)).toEqual({ ok: true, token: 't' })
    expect(send).toHaveBeenCalledWith(EXT_ID, { type: 'token', interactive: false }, expect.any(Function))
    expect(EXT_ID).toBe('fiagillffjfgpckjfblgknnhhcahecdj')
  })

  it('gives up on a silent extension', async () => {
    stubExt(() => new Promise(() => {}))
    expect(await extAvailable()).toBeNull()
  })

  it('extSend passes the body', async () => {
    const send = stubExt(() => ({ ok: true, status: 201 }))
    expect(await extSend({ a: 1 })).toEqual({ ok: true, status: 201 })
    expect(send.mock.calls[0][1]).toEqual({ type: 'send', body: { a: 1 } })
  })
})
