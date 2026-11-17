import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { EXT_ID, EXT_POLL_MS, extAvailable, extSend, extToken, remindSchedule, useExtension } from './extension'
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

  it('once found, a missed answer (sleeping worker, tab switch) never flips it back', async () => {
    vi.useFakeTimers()
    const ext = stubExt(() => ({ ok: true, version: '1.1.0' }))
    const { result } = renderHook(() => useExtension())
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(result.current.version).toBe('1.1.0')
    vi.unstubAllGlobals() // no answer now
    document.dispatchEvent(new Event('visibilitychange'))
    await act(() => vi.advanceTimersByTimeAsync(EXT_POLL_MS * 3))
    expect(result.current.version).toBe('1.1.0')
    expect(ext.mock.calls.length).toBe(1) // no more checks after it was found
  })

  it('keeps checking until the extension is installed', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useExtension())
    await act(() => vi.advanceTimersByTimeAsync(2100))
    expect(result.current.version).toBeNull()
    stubExt(() => ({ ok: true, version: '1.1.0' }))
    await act(() => vi.advanceTimersByTimeAsync(EXT_POLL_MS + 10))
    expect(result.current.version).toBe('1.1.0')
  })
})

describe('remindSchedule (shift → reminder events)', () => {
  it('check-in closes and check-out opens, as HH:MM; unusable shift → null', () => {
    expect(remindSchedule({ check_in_start: '07:30:00', check_in_end: '08:00:00', check_out_start: '17:00:00', check_out_end: '18:00:00' }))
      .toEqual({ masuk: '08:00', pulang: '17:00' })
    expect(remindSchedule({ check_in_end: '8' })).toBeNull()
    expect(remindSchedule(undefined)).toBeNull()
  })
})
