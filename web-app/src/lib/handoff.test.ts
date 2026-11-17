import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeIfAnotherTab, onLogSent } from './handoff'

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms))

describe('tab hand-off', () => {
  afterEach(() => vi.restoreAllMocks())

  it('closes this tab when another Shelia tab answers', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    const other = new BroadcastChannel('shelia')
    other.onmessage = (e) => { if (e.data === 'ping') other.postMessage('pong') }
    closeIfAnotherTab()
    await tick()
    other.close()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('stays open when it is the only Shelia tab', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    closeIfAnotherTab()
    await tick()
    expect(close).not.toHaveBeenCalled()
  })

  it('tells the other tab a log was sent', async () => {
    vi.spyOn(window, 'close').mockImplementation(() => {})
    const seen: unknown[] = []
    const other = new BroadcastChannel('shelia')
    other.onmessage = (e) => seen.push(e.data)
    closeIfAnotherTab('sent')
    await tick()
    other.close()
    expect(seen).toContain('sent')
  })

  it('onLogSent fires on a sent message from another tab', async () => {
    const fn = vi.fn()
    const stop = onLogSent(fn)
    const other = new BroadcastChannel('shelia')
    other.postMessage('sent')
    await tick()
    other.close(); stop()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
