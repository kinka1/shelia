import { describe, expect, it, vi } from 'vitest'
import { handle } from '../../../extension/background.js'
import { installed, nextAt, onAlarm, onClick, pending } from '../../../extension/remind.js'

const SENDER = { origin: 'https://phoenix.holo.my.id', tab: { id: 1, windowId: 9 } }
const at = (iso: string) => new Date(iso)

function fake(stored: Record<string, unknown> = {}, tabs: { id: number; windowId: number }[] = []) {
  const store: Record<string, unknown> = { ...stored }
  return {
    store,
    runtime: { getManifest: () => ({ version: '1.2.0' }) },
    storage: { local: {
      get: vi.fn(async (k: string) => ({ [k]: store[k] })),
      set: vi.fn(async (o: Record<string, unknown>) => { Object.assign(store, o) }),
    } },
    alarms: { create: vi.fn() },
    notifications: { create: vi.fn() },
    tabs: { query: vi.fn(async () => tabs), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    windows: { update: vi.fn(async () => ({})) },
  }
}

describe('nextAt: 15 minutes before the event, Monday–Friday, Jakarta time', () => {
  it('today when still ahead, else the next work day', () => {
    // Mon 16 Nov 2026 07:00 WIB → 07:45 WIB the same day
    expect(nextAt('08:00', at('2026-11-16T00:00:00Z'))).toBe(Date.parse('2026-11-16T00:45:00Z'))
    // already past 07:45 → Tuesday
    expect(nextAt('08:00', at('2026-11-16T01:00:00Z'))).toBe(Date.parse('2026-11-17T00:45:00Z'))
    // Friday evening → Monday
    expect(nextAt('17:00', at('2026-11-20T12:00:00Z'))).toBe(Date.parse('2026-11-23T09:45:00Z'))
  })
})

describe('pending', () => {
  const today = '2026-11-17'
  it('masuk: open until checked in today', () => {
    expect(pending('masuk', { date: today, masuk: true, pulang: false, log: false }, today)).toEqual([])
    expect(pending('masuk', { date: today, masuk: false, pulang: false, log: false }, today)).toEqual(['absen masuk Shelia'])
  })
  it('pulang: lists check-out and the log; status from another day counts as nothing done', () => {
    expect(pending('pulang', { date: today, masuk: true, pulang: false, log: true }, today)).toEqual(['absen pulang Shelia'])
    expect(pending('pulang', { date: today, masuk: true, pulang: true, log: true }, today)).toEqual([])
    expect(pending('pulang', { date: '2026-11-16', masuk: true, pulang: true, log: true }, today)).toEqual(['absen pulang Shelia', 'kirim log MagangHub'])
    expect(pending('pulang', undefined, today)).toEqual(['absen pulang Shelia', 'kirim log MagangHub'])
  })
})

describe('remind messages from the site', () => {
  it('stores the shift times and status, then schedules both alarms from them', async () => {
    const c = fake()
    expect(await handle({ type: 'remind', schedule: { masuk: '08:30', pulang: '17:30' } }, SENDER, c)).toEqual({ ok: true })
    expect(c.store.remind).toMatchObject({ schedule: { masuk: '08:30', pulang: '17:30' } })
    expect(c.alarms.create).toHaveBeenCalledWith('masuk', { when: expect.any(Number) })
    expect(c.alarms.create).toHaveBeenCalledWith('pulang', { when: expect.any(Number) })
    await handle({ type: 'remind', status: { date: '2026-11-17', masuk: true, pulang: false, log: false } }, SENDER, c)
    expect(c.store.remind).toMatchObject({ schedule: { masuk: '08:30' }, status: { masuk: true } })
  })
  it('refuses bad times, and anything from another site', async () => {
    const c = fake()
    expect(await handle({ type: 'remind', schedule: { masuk: '8', pulang: '17:00' } }, SENDER, c)).toEqual({ error: 'invalid' })
    expect(await handle({ type: 'remind', status: { date: 'x', masuk: 1 } }, SENDER, c)).toEqual({ error: 'invalid' })
    expect(await handle({ type: 'remind', schedule: { masuk: '08:00', pulang: '17:00' } }, { origin: 'https://evil.example' }, c)).toEqual({ error: 'origin' })
    expect(c.storage.local.set).not.toHaveBeenCalled()
  })
})

describe('when an alarm fires', () => {
  const now = at('2026-11-17T09:45:00Z') // Tue 16:45 WIB
  it('notifies what is still open and schedules the next one', async () => {
    const c = fake({ remind: { schedule: { masuk: '08:00', pulang: '17:00' }, status: { date: '2026-11-17', masuk: true, pulang: false, log: false } } })
    await onAlarm({ name: 'pulang' }, c, now)
    expect(c.notifications.create).toHaveBeenCalledWith('pulang', expect.objectContaining({
      title: 'Absen pulang mulai 17:00', message: 'Belum: absen pulang Shelia, kirim log MagangHub.',
    }))
    expect(c.alarms.create).toHaveBeenCalledWith('pulang', { when: Date.parse('2026-11-18T09:45:00Z') })
  })
  it('stays quiet when it is already done', async () => {
    const c = fake({ remind: { status: { date: '2026-11-17', masuk: true, pulang: true, log: true } } })
    await onAlarm({ name: 'pulang' }, c, now)
    await onAlarm({ name: 'masuk' }, c, now)
    expect(c.notifications.create).not.toHaveBeenCalled()
    expect(c.alarms.create).toHaveBeenCalledTimes(2)
  })
})

describe('clicking a notification', () => {
  it('focuses an open Phoenix tab; with the log open it asks the page to generate', async () => {
    const c = fake({ remind: { status: { date: '2026-11-17', masuk: true, pulang: true, log: false } } }, [{ id: 4, windowId: 2 }])
    await onClick('pulang', c, at('2026-11-17T09:45:00Z'))
    expect(c.tabs.update).toHaveBeenCalledWith(4, { active: true, url: 'https://phoenix.holo.my.id/?generate=1' })
    expect(c.windows.update).toHaveBeenCalledWith(2, { focused: true })
  })
  it('opens the site when no tab is open', async () => {
    const c = fake()
    await onClick('masuk', c, at('2026-11-17T00:45:00Z'))
    expect(c.tabs.create).toHaveBeenCalledWith({ url: 'https://phoenix.holo.my.id/' })
  })
})

describe('the reminder actually shows on macOS', () => {
  it('is a plain notification: requireInteraction ones are reported to never appear on macOS', async () => {
    const c = fake()
    await onAlarm({ name: 'pulang' }, c, at('2026-11-17T09:45:00Z'))
    expect(c.notifications.create.mock.calls[0][1]).not.toHaveProperty('requireInteraction')
  })
  it('on install or update: schedules, then shows one notification naming the next reminder', async () => {
    const c = fake()
    await installed(c, at('2026-11-17T09:51:00Z')) // Tue 16:51 WIB, just after the 16:45 reminder
    expect(c.alarms.create).toHaveBeenCalledTimes(2)
    expect(c.notifications.create).toHaveBeenCalledWith('aktif', expect.objectContaining({
      title: 'Pengingat absen aktif', message: 'Berikutnya Rabu 07:45: absen masuk.',
    }))
  })
})
