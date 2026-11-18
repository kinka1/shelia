export type Slot = 'masuk' | 'pulang'
export type Event = { id: string; at: string; kind: 'table' | 'nudge' | 'final'; slot: Slot; silent: boolean }

const ev = (at: string, kind: Event['kind'], slot: Slot, silent = false): Event =>
  ({ id: kind === 'final' ? 'final' : kind === 'table' ? `${slot}-table` : `${slot}-nudge-${at.slice(0, 5).replace(':', '')}`, at, kind, slot, silent })

/** The agreed weekday schedule (WIB). Nudges after 23:00 and the final result are silent. */
export const EVENTS: Event[] = [
  ev('07:45:00', 'table', 'masuk'), ev('07:55:00', 'nudge', 'masuk'), ev('08:00:00', 'nudge', 'masuk'),
  ev('16:45:00', 'table', 'pulang'), ev('17:30:00', 'nudge', 'pulang'), ev('20:00:00', 'nudge', 'pulang'),
  ev('22:00:00', 'nudge', 'pulang'), ev('23:00:00', 'nudge', 'pulang'), ev('23:30:00', 'nudge', 'pulang', true),
  ev('23:59:59', 'final', 'pulang', true),
]

/** A table missed (e.g. by a restart) may still be posted until this time. */
export const TABLE_CLOSE: Record<Slot, string> = { masuk: '16:45:00', pulang: '23:59:59' }

/** Jakarta wall clock (UTC+7, no DST). */
export function wib(now: Date): { date: string; time: string; weekday: boolean } {
  const w = new Date(now.getTime() + 7 * 3600_000)
  const iso = w.toISOString()
  const day = w.getUTCDay()
  return { date: iso.slice(0, 10), time: iso.slice(11, 19), weekday: day >= 1 && day <= 5 }
}
