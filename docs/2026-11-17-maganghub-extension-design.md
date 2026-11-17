# MagangHub helper extension — design

## Intent
The user sends the MagangHub daily log and refreshes the MagangHub token from test-shelia every day.
Today that takes bookmarklets: open MagangHub, click a bookmark, come back. The user wants the best
UX: one click on test-shelia, while the send still happens inside MagangHub's own website, from the
user's laptop, with their own MagangHub login — never through the VPS.

## Goals
- **Kirim ke MagangHub** in the confirm dialog sends the log in one click and shows the result
  (Terkirim, or MagangHub's own error).
- **Perbarui token** fetches the token in one click; a missing or expired token is refreshed
  automatically when the page loads.
- Logged out of MagangHub: the extension brings MagangHub's real login page to the front; the user
  logs in there; then
  - token request: continues by itself (waits up to ~5 min), closes the tab, returns to test-shelia;
  - send request: does **not** send by itself; returns to test-shelia with the form intact for a
    fresh click (a send can't be undone).
- Page-load auto refresh never brings a tab to the front; logged out → card shows Belum terhubung.
- Without the extension (other browsers, phone), the bookmark flow keeps working unchanged.

## Non-goals / anti-goals
- No MagangHub/Kemnaker login form in our page; the extension never reads or fills passwords/OTPs.
- No sends from the VPS; no tokens stored server-side.
- No Chrome Web Store publishing; the user loads it unpacked.
- Anti-goal: the extension acting on any site other than MagangHub, or taking orders from any page
  other than test-shelia.

## Constraints
- Chrome Manifest V3. Host permission only `https://monev.maganghub.kemnaker.go.id/*`.
  `externally_connectable` only `https://test-shelia.holo.my.id/*`; localhost was dropped after review: any local server could otherwise read the token
  for local testing). Fixed extension ID via a `key` in the manifest, so the page knows whom to call.
- The send runs in MagangHub's page (MAIN world): token from `sessionStorage.monev_access_token`,
  build id from `window.__NUXT__.config.public.buildId`, `fetch(POST /api/v1/attendances,
  credentials: include)`. A new MagangHub tab logs itself in from the session cookie (observed).
- Same payload checks as the bookmark: date == today WIB, status PRESENT, the three texts ≥ 100
  characters, only `date, status, activity_log, lesson_learned, obstacles, latitude?, longitude?`.
- Our page still requires a working token before sending (existing gate).

## Approaches (chosen: 1)
1. **Chrome extension** — one click, no tab switching; one-time "load unpacked" setup, Chrome on
   this laptop only, needs updating if MagangHub changes its token storage.
2. Userscript (Tampermonkey) — still switches to the MagangHub tab to confirm; needs Tampermonkey.
3. Keep bookmarks only — no install, two extra clicks per send.

## Design
- **Extension** (`extension/` in the repo): `manifest.json`, a service worker. Messages from our page:
  - `hello` → `{ ok, version }` (page detects the extension).
  - `token { interactive }` → `{ ok, token }` | `{ error: 'login' | 'timeout' | ... }`.
  - `send { body }` → `{ ok, status }` | `{ error, status?, message? }`.
  - Work: reuse an open MagangHub tab or create one inactive; wait for load; inject a function that
    waits up to ~10 s for the token; if none and `interactive`, focus the tab and wait (tab URL back
    on MagangHub + token) up to ~5 min; close only tabs it created; re-focus the test-shelia tab.
- **Page**: a small `lib/extension.ts` (detect, getToken, send). MagangHubCard/TokenDialog use it
  when present; otherwise the bookmark UI as today. Setup instructions in the token dialog when the
  extension is not detected (Chrome only).

## Left to the builder
Exact message timeouts, wording of status lines, file layout inside `extension/`, how the page
re-focuses (tabs.update on the sender tab), tests (extension logic as plain functions under Vitest).
