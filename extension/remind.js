// Reminders 15 minutes before Shelia check-in closes and check-out opens (Mon–Fri, Jakarta time).
// The site sends only shift times and today's done flags; tokens never reach the extension.
import { ALLOWED_ORIGINS, todayWIB } from './mh.js'

const SITE = ALLOWED_ORIGINS[0] + '/'
const WIB = 7 * 3600_000
const BEFORE = 15
export const DEFAULT_SCHEDULE = { masuk: '08:00', pulang: '17:00' } // event times until the site sends a shift
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const KINDS = ['masuk', 'pulang']

/** The next Monday–Friday instant, 15 minutes before `event` (HH:MM, Jakarta), strictly after now. */
export function nextAt(event, now = new Date()) {
  const [h, m] = event.split(':').map(Number)
  const w = new Date(now.getTime() + WIB) // Jakarta wall clock, read with UTC getters
  for (let d = 0; d < 8; d++) {
    const day = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + d))
    const t = day.getTime() + (h * 60 + m - BEFORE) * 60_000 - WIB
    if (t > now.getTime() && day.getUTCDay() % 6 !== 0) return t
  }
}

/** What is still open for this alarm; status from another day counts as nothing done. */
export function pending(kind, status, today) {
  const s = status && status.date === today ? status : {}
  if (kind === 'masuk') return s.masuk ? [] : ['absen masuk Shelia']
  return [!s.pulang && 'absen pulang Shelia', !s.log && 'kirim log MagangHub'].filter(Boolean)
}

const load = async (chrome) => (await chrome.storage.local.get('remind')).remind || {}

export async function schedule(chrome, now = new Date()) {
  const times = { ...DEFAULT_SCHEDULE, ...(await load(chrome)).schedule }
  for (const k of KINDS) chrome.alarms.create(k, { when: nextAt(times[k], now) })
}

/** { schedule: {masuk, pulang} } and/or { status: {date, masuk, pulang, log} } from the site. */
export async function onRemind(msg, chrome) {
  const { schedule: sch, status: st } = msg
  if (sch && !KINDS.every((k) => HHMM.test(sch[k]))) return { error: 'invalid' }
  if (st && !(/^\d{4}-\d\d-\d\d$/.test(st.date) && ['masuk', 'pulang', 'log'].every((k) => typeof st[k] === 'boolean'))) return { error: 'invalid' }
  if (!sch && !st) return { error: 'invalid' }
  const r = await load(chrome)
  if (sch) r.schedule = { masuk: sch.masuk, pulang: sch.pulang }
  if (st) r.status = { date: st.date, masuk: st.masuk, pulang: st.pulang, log: st.log }
  await chrome.storage.local.set({ remind: r })
  if (sch) await schedule(chrome)
  return { ok: true }
}

export async function onAlarm(alarm, chrome, now = new Date()) {
  if (!KINDS.includes(alarm.name)) return
  const r = await load(chrome)
  const open = pending(alarm.name, r.status, todayWIB(now))
  const event = { ...DEFAULT_SCHEDULE, ...r.schedule }[alarm.name]
  if (open.length) {
    chrome.notifications.create(alarm.name, {
      type: 'basic', iconUrl: 'icon.png', priority: 2, requireInteraction: true,
      title: alarm.name === 'masuk' ? `Absen masuk sebelum ${event}` : `Absen pulang mulai ${event}`,
      message: `Belum: ${open.join(', ')}.`,
    })
  }
  chrome.alarms.create(alarm.name, { when: nextAt(event, now) })
}

/** Open the Absen page (reusing a test-shelia tab); with the log still open, ask it to generate. */
export async function onClick(id, chrome, now = new Date()) {
  const r = await load(chrome)
  const url = SITE + (id === 'pulang' && pending('pulang', r.status, todayWIB(now)).includes('kirim log MagangHub') ? '?generate=1' : '')
  const [tab] = await chrome.tabs.query({ url: SITE + '*' })
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true, url })
    await chrome.windows.update(tab.windowId, { focused: true })
  } else await chrome.tabs.create({ url })
  chrome.notifications.clear?.(id)
}
