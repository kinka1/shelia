// Shared by the worker (background.js) and the tests. pageToken and pageSend are injected into
// MagangHub's page, so they must not use anything outside their own body.

export const MH_SITE = 'https://monev.maganghub.kemnaker.go.id'
export const ALLOWED_ORIGINS = ['https://test-shelia.holo.my.id']
const TEXTS = ['activity_log', 'lesson_learned', 'obstacles']

export const todayWIB = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)

/** MagangHub's create payload, checked like the bookmark does; anything else is dropped. */
export function validateBody(b, now = new Date()) {
  if (!b || typeof b !== 'object') return { error: 'Data log tidak valid.' }
  if (b.date !== todayWIB(now)) return { error: 'Log hanya bisa dikirim untuk hari ini.' }
  if (b.status !== 'PRESENT') return { error: 'Status harus Hadir.' }
  if (!TEXTS.every((k) => typeof b[k] === 'string' && b[k].trim().length >= 100)) return { error: 'Setiap isian minimal 100 karakter.' }
  const body = { date: b.date, status: 'PRESENT', activity_log: b.activity_log, lesson_learned: b.lesson_learned, obstacles: b.obstacles }
  if (Number.isFinite(b.latitude) && Number.isFinite(b.longitude)) {
    body.latitude = b.latitude; body.longitude = b.longitude
  }
  return { body }
}

/** In MagangHub's page: its login token, waiting for the page to log itself in from the cookie. */
export async function pageToken(waitMs) {
  const end = Date.now() + waitMs
  for (;;) {
    const t = sessionStorage.getItem('monev_access_token')
    if (t || Date.now() >= end) return t || null
    await new Promise((r) => setTimeout(r, 250))
  }
}

/** In MagangHub's page: the same POST its own form makes. */
export async function pageSend(body) {
  const t = sessionStorage.getItem('monev_access_token')
  const c = (window.__NUXT__ && window.__NUXT__.config && window.__NUXT__.config.public) || {}
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }
  if (c.buildId) headers['X-Frontend-Build-ID'] = c.buildId
  const r = await fetch('https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances', { method: 'POST', credentials: 'include', headers, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, message: j.message || j.error || '' }
}
