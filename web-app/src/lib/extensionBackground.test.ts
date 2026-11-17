import { describe, expect, it, vi } from 'vitest'
import { DEFAULTS, handle, reloadShelia } from '../../../extension/background.js'
import { pageSend, pageToken, todayWIB } from '../../../extension/mh.js'

const SENDER = { origin: 'https://phoenix.holo.my.id', tab: { id: 1, windowId: 9 } }
const T = 'x'.repeat(100)
const body = () => ({ date: todayWIB(), status: 'PRESENT', activity_log: T, lesson_learned: T, obstacles: T })
const FAST = { tokenWaitMs: 5, loginWaitMs: 200, pollMs: 20 }

/** Minimal chrome.* fake. tokens: answers to successive pageToken injections. */
function fake({ open = false, tokens = [] as (string | null)[], send = { status: 201, message: '' } } = {}) {
  const upd = new Set<(id: number, i: { status?: string }) => void>()
  const rem = new Set<(id: number) => void>()
  let alive = true
  const c = {
    runtime: { getManifest: () => ({ version: '1.0.0' }) },
    tabs: {
      query: vi.fn(async () => (open ? [{ id: 7, windowId: 9, url: 'https://monev.maganghub.kemnaker.go.id/dashboard' }] : [])),
      create: vi.fn(async () => { setTimeout(() => upd.forEach((l) => l(8, { status: 'complete' })), 1); return { id: 8, windowId: 9 } }),
      get: vi.fn(async (id: number) => { if (!alive) throw new Error('No tab'); return { id, url: 'https://monev.maganghub.kemnaker.go.id/dashboard', status: 'complete' } }),
      update: vi.fn(async () => ({})),
      remove: vi.fn(async () => {}),
      onUpdated: { addListener: (l: any) => upd.add(l), removeListener: (l: any) => upd.delete(l) },
      onRemoved: { addListener: (l: any) => rem.add(l), removeListener: (l: any) => rem.delete(l) },
    },
    windows: { update: vi.fn(async () => ({})) },
    scripting: {
      executeScript: vi.fn(async ({ func, args }: any) => {
        if (func === pageToken) return [{ result: tokens.length ? tokens.shift() : null }]
        if (func === pageSend) return [{ result: send }]
        throw new Error('unexpected ' + args)
      }),
    },
    fireUpdated: (id: number) => upd.forEach((l) => l(id, { status: 'complete' })),
    close: (id: number) => { alive = false; rem.forEach((l) => l(id)) },
  }
  return c
}
const activated = (c: ReturnType<typeof fake>) => c.tabs.update.mock.calls.some(([id, p]: any) => id !== 1 && p.active)

describe('extension worker', () => {
  it('hello reports the version; other origins are refused', async () => {
    const c = fake()
    expect(await handle({ type: 'hello' }, SENDER, c)).toEqual({ ok: true, version: '1.0.0' })
    expect(await handle({ type: 'hello' }, { origin: 'https://evil.example' }, c)).toEqual({ error: 'origin' })
    expect(await handle({ type: 'token', interactive: true }, { origin: 'https://evil.example' }, c)).toEqual({ error: 'origin' })
    expect(c.tabs.query).not.toHaveBeenCalled()
  })

  it('token reuses an open MagangHub tab and leaves it open', async () => {
    const c = fake({ open: true, tokens: ['tok'] })
    expect(await handle({ type: 'token', interactive: false }, SENDER, c, FAST)).toEqual({ ok: true, token: 'tok' })
    expect(c.tabs.create).not.toHaveBeenCalled()
    expect(c.tabs.remove).not.toHaveBeenCalled()
    expect(c.tabs.query).toHaveBeenCalledWith({ url: 'https://monev.maganghub.kemnaker.go.id/*', discarded: false }) // a sleeping tab can't run scripts
    expect(c.scripting.executeScript.mock.calls[0][0]).toMatchObject({ target: { tabId: 7 }, world: 'MAIN' })
  })

  it('token opens a background tab when none is open, then closes it', async () => {
    const c = fake({ tokens: ['tok'] })
    expect(await handle({ type: 'token', interactive: false }, SENDER, c, FAST)).toEqual({ ok: true, token: 'tok' })
    expect(c.tabs.create).toHaveBeenCalledWith({ url: 'https://monev.maganghub.kemnaker.go.id/dashboard', active: false })
    expect(c.tabs.remove).toHaveBeenCalledWith(8)
  })

  it('silent token without login never brings a tab forward', async () => {
    const c = fake()
    expect(await handle({ type: 'token', interactive: false }, SENDER, c, FAST)).toEqual({ error: 'login' })
    expect(activated(c)).toBe(false)
    expect(c.tabs.remove).toHaveBeenCalledWith(8)
  })

  it('interactive token waits for the user to log in, then returns to the caller', async () => {
    const c = fake({ tokens: [null, null] })
    const p = handle({ type: 'token', interactive: true }, SENDER, c, FAST)
    await vi.waitFor(() => expect(activated(c)).toBe(true))
    c.scripting.executeScript.mockImplementationOnce(async () => [{ result: 'tok' }])
    c.fireUpdated(8)
    expect(await p).toEqual({ ok: true, token: 'tok' })
    expect(c.tabs.remove).toHaveBeenCalledWith(8)
    expect(c.tabs.update).toHaveBeenLastCalledWith(1, { active: true })
    expect(c.windows.update).toHaveBeenLastCalledWith(9, { focused: true })
  })

  it('login wait ends when the tab is closed, or after the time limit, polling meanwhile', async () => {
    const c = fake()
    const p = handle({ type: 'token', interactive: true }, SENDER, c, FAST)
    await vi.waitFor(() => expect(activated(c)).toBe(true))
    c.close(8)
    expect(await p).toEqual({ error: 'closed' })
    const d = fake()
    expect(await handle({ type: 'token', interactive: true }, SENDER, d, FAST)).toEqual({ error: 'timeout' })
    expect(d.tabs.get.mock.calls.length).toBeGreaterThan(3)
  })

  it('send checks the body before opening anything', async () => {
    const c = fake()
    expect(await handle({ type: 'send', body: { ...body(), status: 'ABSENT' } }, SENDER, c, FAST)).toMatchObject({ error: 'invalid' })
    expect(c.tabs.query).not.toHaveBeenCalled()
  })

  it('send posts from MagangHub\'s page and reports the result', async () => {
    const c = fake({ open: true, tokens: ['tok'] })
    expect(await handle({ type: 'send', body: { ...body(), location: 'x' } }, SENDER, c, FAST)).toEqual({ ok: true, status: 201 })
    const call = c.scripting.executeScript.mock.calls.find(([a]: any) => a.func === pageSend)![0]
    expect(call).toMatchObject({ target: { tabId: 7 }, world: 'MAIN', args: [body()] })
    const d = fake({ open: true, tokens: ['tok'], send: { status: 422, message: 'Minimal 100 karakter' } })
    expect(await handle({ type: 'send', body: body() }, SENDER, d, FAST)).toEqual({ error: 'http', status: 422, message: 'Minimal 100 karakter' })
  })

  it('send never sends after a login was needed', async () => {
    const c = fake({ tokens: [null] })
    const p = handle({ type: 'send', body: body() }, SENDER, c, FAST)
    await vi.waitFor(() => expect(activated(c)).toBe(true))
    c.scripting.executeScript.mockImplementationOnce(async () => [{ result: 'tok' }])
    c.fireUpdated(8)
    expect(await p).toEqual({ error: 'login' })
    expect(c.scripting.executeScript.mock.calls.some(([a]: any) => a.func === pageSend)).toBe(false)
  })
  it('a whole request fits in Chrome\'s 5-minute limit for one event', () => {
    expect(DEFAULTS.loadWaitMs + DEFAULTS.tokenWaitMs + DEFAULTS.loginWaitMs + 1_000).toBeLessThanOrEqual(270_000)
  })
  it('after install or update, reloads open test-shelia tabs so they see the extension', async () => {
    const c = fake()
    c.tabs.query.mockResolvedValueOnce([{ id: 3 }, { id: 4 }] as any)
    ;(c.tabs as any).reload = vi.fn(async () => {})
    await reloadShelia(c)
    expect(c.tabs.query).toHaveBeenCalledWith({ url: 'https://phoenix.holo.my.id/*' })
    expect((c.tabs as any).reload.mock.calls).toEqual([[3], [4]])
  })
})
