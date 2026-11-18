import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRemindReport } from './useRemindReport'

afterEach(() => vi.unstubAllGlobals())
const D = '2026-11-18'
function stub() {
  const f = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', f)
  const bodies = () => f.mock.calls.map((c) => { const [u, i] = c as unknown as [string, RequestInit]; return [u, JSON.parse(String(i.body))] })
  return { f, bodies }
}
type P = Parameters<typeof useRemindReport>[0]
const props = (o: Partial<P> = {}): P => ({ date: D, sheliaToken: null, sheliaName: undefined, sheliaToday: null, mhConnected: false, sentAt: null, ...o })

describe('useRemindReport', () => {
  it('Shelia session: reports the platform with the name, then today\'s flags', async () => {
    const s = stub()
    renderHook(() => useRemindReport(props({ sheliaToken: 't', sheliaName: 'Bagas Gunawan', sheliaToday: { status: 'checked_in', next_action: 'check_out' } })))
    await waitFor(() => expect(s.bodies()).toContainEqual(['/remind-api/me', { shelia: true, sheliaName: 'Bagas Gunawan' }]))
    await waitFor(() => expect(s.bodies()).toContainEqual(['/remind-api/me/today', { date: D, masuk: true, pulang: false }]))
  })
  it('MagangHub only: platform and the log, without any Shelia session', async () => {
    const s = stub()
    renderHook(() => useRemindReport(props({ mhConnected: true, sentAt: '16:50' })))
    await waitFor(() => expect(s.bodies()).toContainEqual(['/remind-api/me', { maganghub: true }]))
    await waitFor(() => expect(s.bodies()).toContainEqual(['/remind-api/me/today', { date: D, log: true }]))
    expect(s.bodies().some(([, b]) => 'shelia' in b)).toBe(false)
  })
  it('an expired MagangHub token or lost Shelia session never reports false', async () => {
    const s = stub()
    const { rerender } = renderHook((p: P) => useRemindReport(p), { initialProps: props({ sheliaToken: 't', mhConnected: true }) })
    await waitFor(() => expect(s.f).toHaveBeenCalled())
    rerender(props({ sheliaToken: null, mhConnected: false }))
    await new Promise((r) => setTimeout(r, 20))
    expect(s.bodies().some(([, b]) => b.shelia === false || b.maganghub === false)).toBe(false)
  })
})
