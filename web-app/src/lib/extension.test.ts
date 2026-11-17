import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { EXT_ID, EXT_POLL_MS, extAvailable, extSend, extToken, useExtension } from './extension'
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

describe('useExtension', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('is "checking" (undefined) until the first answer, then the version', async () => {
    stubExt(() => ({ ok: true, version: '1.1.0' }))
    const { result } = renderHook(() => useExtension())
    expect(result.current.version).toBeUndefined()
    await waitFor(() => expect(result.current.version).toBe('1.1.0'))
  })

  it('notices a removed extension while the tab stays open', async () => {
    vi.useFakeTimers()
    stubExt(() => ({ ok: true, version: '1.1.0' }))
    const { result } = renderHook(() => useExtension())
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(result.current.version).toBe('1.1.0')
    vi.unstubAllGlobals() // extension removed
    await act(() => vi.advanceTimersByTimeAsync(EXT_POLL_MS + 10))
    expect(result.current.version).toBeNull()
  })
})
