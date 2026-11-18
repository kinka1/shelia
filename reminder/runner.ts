import { EVENTS, TABLE_CLOSE, wib, type Slot } from './schedule.ts'
import { renderFinal, renderLibur, renderNudge, renderTable } from './render.ts'
import type { Store } from './store.ts'

type Tg = { send(html: string, silent: boolean): Promise<number | null>; edit(id: number, html: string): Promise<boolean> }

const secs = (t: string) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s }
const SLOTS: Slot[] = ['masuk', 'pulang']

export function createRunner(o: { store: Store; tg: Tg; now?: () => Date; debounceMs?: number }) {
  const { store, tg } = o
  const now = o.now ?? (() => new Date())
  const debounceMs = o.debounceMs ?? 5000
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let busy = false
  // After a failed send (the client already retried transient errors), wait before trying that event again,
  // so a permanent error (bot removed, chat not found) is not resent 4 times a second.
  const retryAt = new Map<string, number>()
  const RETRY_MS = 30_000

  const tracked = (slot: Slot, date: string) => store.roster(date).filter((r) => (slot === 'masuk' ? r.shelia : r.shelia || r.maganghub))

  async function runDue(date: string, time: string, ms: number) {
    const post = async (key: string, html: string, silent: boolean) => {
      if ((retryAt.get(key) ?? 0) > ms) return null
      const id = await tg.send(html, silent)
      if (id == null) retryAt.set(key, ms + RETRY_MS); else retryAt.delete(key)
      return id
    }
    for (const e of EVENTS) {
      if (time < e.at || store.fired(date, e.id)) continue
      const key = `${date} ${e.id}`
      const late = secs(time) - secs(e.at) >= 60
      if (e.kind === 'table') {
        if (time >= TABLE_CLOSE[e.slot]) { store.markFired(date, e.id); continue }
        const rows = tracked(e.slot, date)
        if (!rows.length) continue // nobody yet: a later joiner still gets the table while the slot is open
        const id = await post(key, renderTable(e.slot, date, rows), e.silent)
        if (id != null) { store.setMessage(date, e.slot, id); store.markFired(date, e.id) }
        continue
      }
      if (late) { store.markFired(date, e.id); continue } // nudges and the final are never posted late
      const rows = store.roster(date)
      const html = e.kind === 'nudge' ? renderNudge(e.slot, rows) : tracked('pulang', date).length ? renderFinal(date, rows) : null
      if (html == null) { store.markFired(date, e.id); continue }
      if ((await post(key, html, e.silent)) != null) store.markFired(date, e.id)
    }
  }

  async function refresh(date: string) {
    if (store.fired(date, 'final')) return
    const holiday = store.isHoliday(date)
    for (const slot of SLOTS) {
      const id = store.getMessage(date, slot)
      if (id != null) await tg.edit(id, holiday ? renderLibur(date) : renderTable(slot, date, tracked(slot, date)))
    }
  }

  return {
    /** Called often (every 250 ms). Never rejects; a tick still running makes the next one a no-op. */
    async tick(): Promise<void> {
      if (busy) return
      busy = true
      try {
        const t = now()
        const { date, time, weekday } = wib(t)
        if (weekday && !store.isHoliday(date)) await runDue(date, time, t.getTime())
      } catch (e) {
        console.error('reminder tick failed:', e instanceof Error ? e.message : e)
      } finally { busy = false }
    },
    /** Someone's status changed: re-render that day's live tables, debounced. */
    changed(date: string): void {
      clearTimeout(timers.get(date))
      timers.set(date, setTimeout(() => { timers.delete(date); refresh(date).catch((e) => console.error('reminder refresh failed:', e?.message ?? e)) }, debounceMs))
    },
    /** Holiday switched on or off: posted tables become "Libur hari ini", or back. */
    async holidayChanged(date: string): Promise<void> {
      try { await refresh(date) } catch (e) { console.error('reminder holiday refresh failed:', e instanceof Error ? e.message : e) }
    },
  }
}
