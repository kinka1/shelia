// Takes requests from test-shelia only, and does them inside a MagangHub tab: reuse an open one, or
// open one in the background and close it afterwards. Passwords and OTPs are never touched: when
// MagangHub needs a login, its own login page is brought forward for the user.
import { ALLOWED_ORIGINS, MH_SITE, pageSend, pageToken, validateBody } from './mh.js'
import { onAlarm, onClick, onRemind, schedule } from './remind.js'

// Chrome may stop a worker whose single event runs past 5 minutes, so the whole request stays under 4.5.
export const DEFAULTS = { loadWaitMs: 15_000, tokenWaitMs: 10_000, loginWaitMs: 240_000, pollMs: 20_000 }

export async function handle(msg, sender, chrome, opts = {}) {
  const o = { ...DEFAULTS, ...opts }
  if (!ALLOWED_ORIGINS.includes(sender && sender.origin)) return { error: 'origin' }
  if (msg && msg.type === 'hello') return { ok: true, version: chrome.runtime.getManifest().version }
  if (msg && msg.type === 'remind') return onRemind(msg, chrome)

  let body
  if (msg && msg.type === 'send') {
    const v = validateBody(msg.body)
    if (v.error) return { error: 'invalid', message: v.error }
    body = v.body
  } else if (!msg || msg.type !== 'token') return { error: 'invalid' }
  const interactive = msg.type === 'send' || !!msg.interactive

  const { tab, created } = await openMh(chrome, o.loadWaitMs)
  let raised = false
  try {
    let token = await run(chrome, tab.id, pageToken, [o.tokenWaitMs])
    let loggedInNow = false
    if (!token) {
      if (!interactive) return { error: 'login' }
      raised = true
      await chrome.tabs.update(tab.id, { active: true })
      await chrome.windows.update(tab.windowId, { focused: true })
      const r = await waitForLogin(chrome, tab.id, o)
      if (r.error) return r
      token = r.token
      loggedInNow = true
    }
    if (msg.type === 'token') return { ok: true, token }
    if (loggedInNow) return { error: 'login' } // a send needs a fresh click after logging in
    const res = await run(chrome, tab.id, pageSend, [body])
    if (!res) return { error: 'http', status: 0, message: 'Halaman MagangHub tidak merespons.' }
    return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status } : { error: 'http', status: res.status, message: res.message }
  } finally {
    if (created) await chrome.tabs.remove(tab.id).catch(() => {})
    if (raised && sender.tab) {
      await chrome.tabs.update(sender.tab.id, { active: true }).catch(() => {})
      await chrome.windows.update(sender.tab.windowId, { focused: true }).catch(() => {})
    }
  }
}

async function openMh(chrome, loadWaitMs) {
  // discarded (sleeping) tabs can't run scripts and would look logged out
  const [open] = await chrome.tabs.query({ url: MH_SITE + '/*', discarded: false })
  if (open) return { tab: open, created: false }
  const loaded = nextEvent(chrome, null, loadWaitMs)
  const tab = await chrome.tabs.create({ url: MH_SITE + '/dashboard', active: false })
  loaded.watch(tab.id)
  await loaded.done
  return { tab, created: true }
}

/** Run a self-contained function in the MagangHub page; null when the page isn't MagangHub (e.g. SSO). */
async function run(chrome, tabId, func, args) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args })
    return r ? r.result : null
  } catch { return null }
}

/** Wait for the user to log in on the raised tab: re-check after each page load, and poll
 *  tabs.get meanwhile (also keeps the MV3 worker awake during a long wait). */
async function waitForLogin(chrome, tabId, o) {
  const end = Date.now() + o.loginWaitMs
  while (Date.now() < end) {
    const ev = nextEvent(chrome, tabId, Math.min(o.pollMs, end - Date.now()))
    const why = await ev.done
    if (why === 'removed') return { error: 'closed' }
    let tab
    try { tab = await chrome.tabs.get(tabId) } catch { return { error: 'closed' } }
    if (tab.url && tab.url.startsWith(MH_SITE) && tab.status === 'complete') {
      const token = await run(chrome, tabId, pageToken, [1_000])
      if (token) return { token }
    }
  }
  return { error: 'timeout' }
}

/** Resolves with 'loaded' | 'removed' | 'timeout' for the watched tab, whichever comes first. */
function nextEvent(chrome, tabId, ms) {
  let id = tabId, finish
  const done = new Promise((res) => { finish = res })
  const onUpd = (t, info) => { if (t === id && info.status === 'complete') end('loaded') }
  const onRem = (t) => { if (t === id) end('removed') }
  const timer = setTimeout(() => end('timeout'), ms)
  function end(why) {
    clearTimeout(timer)
    chrome.tabs.onUpdated.removeListener(onUpd)
    chrome.tabs.onRemoved.removeListener(onRem)
    finish(why)
  }
  chrome.tabs.onUpdated.addListener(onUpd)
  chrome.tabs.onRemoved.addListener(onRem)
  return { done, watch: (t) => { id = t } }
}

/** Chrome only lets a page see an extension that was installed when the page loaded, so reload
 *  open test-shelia tabs after install or update: they pick the extension up right away. */
export async function reloadShelia(chrome) {
  const tabs = await chrome.tabs.query({ url: ALLOWED_ORIGINS[0] + '/*' })
  for (const t of tabs) await chrome.tabs.reload(t.id).catch(() => {})
}

if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessageExternal) {
  chrome.runtime.onInstalled.addListener(() => { void reloadShelia(chrome); void schedule(chrome) })
  chrome.runtime.onStartup.addListener(() => { void schedule(chrome) })
  chrome.alarms.onAlarm.addListener((a) => { void onAlarm(a, chrome) })
  chrome.notifications.onClicked.addListener((id) => { void onClick(id, chrome) })
  chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
    handle(msg, sender, chrome).then(reply, () => reply({ error: 'failed' }))
    return true // keep the channel open for the async reply
  })
}
