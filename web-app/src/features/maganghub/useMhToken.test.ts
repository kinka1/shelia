import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useMhToken } from './useMhToken'
import { MH_KEY } from '@/lib/maganghub'
import { fetchMyToday } from '@/lib/dailyLog'

const jwt = (exp: number) => `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`
const ok = () => new Response(JSON.stringify({ data: [] }))

beforeEach(() => localStorage.clear())
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('useMhToken: Terhubung follows the token', () => {
  it('turns Kedaluwarsa by itself the moment the token expires, with the page left open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-18T09:00:00Z'))
    localStorage.setItem(MH_KEY, jwt(Date.parse('2026-11-18T09:00:05Z') / 1000))
    vi.stubGlobal('fetch', vi.fn(async () => ok()))
    const { result } = renderHook(() => useMhToken())
    expect(result.current.status).toBe('ok')
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(result.current.status).toBe('expired')
  })

  it('a 401 from any later MagangHub request (the card\'s today check) turns it Kedaluwarsa', async () => {
    localStorage.setItem(MH_KEY, jwt(Date.now() / 1000 + 3600))
    const f = vi.fn(async () => ok())
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useMhToken())
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(result.current.status).toBe('ok')
    f.mockImplementation(async () => new Response('{}', { status: 401 }))
    await act(async () => { await fetchMyToday('2026-11-18') })
    expect(result.current.status).toBe('expired')
  })
})
