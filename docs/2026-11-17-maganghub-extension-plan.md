# MagangHub helper extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that lets test-shelia fetch the MagangHub token and send the daily log in one click, running inside MagangHub's own page.

**Architecture:** MV3 extension in `extension/` (service worker + pure helpers). test-shelia talks to it with `chrome.runtime.sendMessage(EXT_ID, …)` (allowed by `externally_connectable`). The worker opens or reuses a MagangHub tab, injects functions into the page's MAIN world to read the token or POST the log, then closes the tab it opened and refocuses the caller. The page falls back to the bookmark flow when the extension is absent.

**Tech Stack:** Chrome MV3 (plain ES modules, no build), React 19 + TS page, Vitest.

**Spec:** `docs/2026-11-17-maganghub-extension-design.md`

## Global Constraints
- Host permission only `https://monev.maganghub.kemnaker.go.id/*`; permissions only `scripting`.
- `externally_connectable.matches`: `https://test-shelia.holo.my.id/*`, `http://localhost:4173/*`.
- Fixed ID via manifest `key` (public key only; never commit a private key).
- Payload: only `date, status, activity_log, lesson_learned, obstacles, latitude?, longitude?`; `date` == today WIB; `status` == `PRESENT`; each text `trim().length >= 100`; lat/lng only when both finite numbers.
- POST `https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances`, `credentials: 'include'`, headers `Content-Type: application/json`, `Authorization: Bearer <sessionStorage.monev_access_token>`, `X-Frontend-Build-ID` from `window.__NUXT__.config.public.buildId` when present.
- Never read or fill passwords/OTPs. After a login was needed, a send is NOT performed: return `{ error: 'login' }`.
- Close only tabs the extension created. Silent (`interactive: false`) requests never activate a tab.
- No changes to nginx/VPS; the extension is not deployed, the user loads it unpacked.

## Review Focus
- MV3 worker idles out during the up-to-5-minute login wait → poll with a `chrome.tabs.get` call every 20 s so the worker stays alive (Task 2 test: login wait resolves after several polls).
- Two clicks in quick succession (double click on Kirim) → page disables the button while a request runs (Task 3 test).
- User closes the MagangHub tab while the extension waits for login → resolve `{ error: 'closed' }`, no hang (Task 2 test).
- Extension missing / `chrome.runtime` undefined (Safari, phone, other browser) → page shows the bookmark flow unchanged (Task 3 test).
- A page other than test-shelia trying to use the extension → blocked by `externally_connectable`; the worker also checks `sender.origin` against the same list (Task 2 test).

---

### Task 1: Extension skeleton, fixed ID, payload validator

**Files:**
- Create: `extension/manifest.json`, `extension/mh.js`, `extension/README.md`
- Test: `web-app/src/lib/extensionMh.test.ts` (imports `../../../extension/mh.js`)

**Interfaces:**
- Produces: `export const MH_SITE = 'https://monev.maganghub.kemnaker.go.id'`; `export const ALLOWED_ORIGINS: string[]`; `export function todayWIB(now?: Date): string`; `export function validateBody(b: unknown, now?: Date): { body: object } | { error: string }`; `export function pageToken(waitMs: number): Promise<string | null>` (self-contained, injected); `export function pageSend(body: object): Promise<{ status: number; message: string }>` (self-contained, injected). Extension ID string recorded in README.

- [ ] Step 1: Tests: `validateBody` accepts a valid body and returns exactly the allowed keys (drops `location`, `participant_id`); rejects wrong date (yesterday WIB), status `ABSENT`, a 99-char text, non-object; keeps lat/lng only when both finite. `pageToken(50)` with `sessionStorage` stub returns the token / `null` after the wait. `pageSend` with stubbed `fetch` and `window.__NUXT__` sends the exact URL, method, credentials and headers above.
- [ ] Step 2: Run `cd web-app && npx vitest run src/lib/extensionMh.test.ts` → FAIL (module missing).
- [ ] Step 3: Generate key: `openssl genrsa 2048 | openssl rsa -pubout -outform DER | base64` → manifest `key`; ID = first 32 hex chars of `sha256(DER)` mapped `0-f → a-p`. Write manifest (MV3, `background.service_worker: background.js`, `type: module`, permissions/hosts/externally_connectable per Global Constraints, name "Shelia MagangHub", version `1.0.0`) and `mh.js`. README: load-unpacked steps (Indonesian) and the ID.
- [ ] Step 4: Run the test → PASS.
- [ ] Step 5: Commit `feat(extension): manifest, fixed ID, payload checks and page functions`.

### Task 2: Service worker orchestration

**Files:**
- Create: `extension/background.js`
- Test: `web-app/src/lib/extensionBackground.test.ts` (fake `chrome` object)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `export async function handle(msg, sender, chrome, opts?): Promise<Result>` where `msg` is `{ type: 'hello' } | { type: 'token', interactive: boolean } | { type: 'send', body: object }` and `Result` is `{ ok: true, version } | { ok: true, token } | { ok: true, status } | { error: 'origin' | 'login' | 'closed' | 'timeout' | 'invalid' | 'http', status?, message? }`. Registration: `chrome.runtime.onMessageExternal.addListener((m, s, reply) => { handle(m, s, chrome).then(reply); return true })`. `opts` = `{ tokenWaitMs = 10000, loginWaitMs = 300000, pollMs = 20000 }` for tests.

- [ ] Step 1: Tests with a fake `chrome` (tabs.query/create/get/update/remove, tabs.onUpdated, scripting.executeScript, windows.update):
  - `hello` → `{ ok: true, version: '1.0.0' }`; sender origin not allowed → `{ error: 'origin' }`.
  - `token` reuses an open MagangHub tab (no create, no remove); with none, creates `{ active: false }` and removes it after.
  - `token` silent with no token → `{ error: 'login' }`, `tabs.update` never called with `active: true`.
  - `token` interactive, token appears after a later `onUpdated` complete → `{ ok, token }`, created tab removed, sender tab refocused.
  - interactive wait: user closes the tab → `{ error: 'closed' }`; nothing after `loginWaitMs` → `{ error: 'timeout' }`; `tabs.get` called each `pollMs`.
  - `send` with invalid body → `{ error: 'invalid' }`, no tab opened; valid + token present → executeScript with `pageSend` in `world: 'MAIN'`, 201 → `{ ok, status: 201 }`, 422 → `{ error: 'http', status: 422, message }`; login needed → `{ error: 'login' }` and `pageSend` never injected.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement `handle` and the listener.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(extension): worker opens MagangHub, reads token, sends log`.

### Task 3: Page integration

**Files:**
- Create: `web-app/src/lib/extension.ts`, test `web-app/src/lib/extension.test.ts`
- Modify: `web-app/src/lib/sendBookmarklet.ts` (extract `sendBody(v: SendLog)`; `sendUrl` uses it), `features/maganghub/useMhToken.ts`, `TokenDialog.tsx`, `MagangHubCard.tsx` and their tests.

**Interfaces:**
- Consumes: extension ID (Task 1), `Result` shape (Task 2).
- Produces: `export const EXT_ID`; `export function extAvailable(): Promise<boolean>` (hello, 800 ms timeout, false when `chrome?.runtime?.sendMessage` missing); `export function extToken(interactive: boolean): Promise<Result>`; `export function extSend(body: object): Promise<Result>`; `export function sendBody(v: SendLog): Record<string, unknown>`.

- [ ] Step 1: Tests:
  - `extAvailable` false without `chrome.runtime`, true on `{ ok: true }`, false on timeout.
  - `useMhToken`: extension present and status not ok on mount → `extToken(false)`; `{ ok, token }` saves the token.
  - TokenDialog with extension: one **Ambil token** button → `extToken(true)`; ok → dialog closes; `login` → "Login MagangHub di tab yang terbuka, lalu klik lagi." Without extension: bookmarks unchanged, plus a line on installing the extension.
  - MagangHubCard confirm with extension: one **Kirim ke MagangHub** button → `extSend(sendBody(...))`, disabled while pending (double click sends once); ok → dialog closes, re-check shows Terkirim; `http` → MagangHub's message shown in the dialog; `login` → "Login MagangHub dulu di tab yang terbuka, lalu kirim lagi." Without extension: today's steps and **Buka MagangHub**.
  - Install status (user request): TokenDialog shows "Ekstensi terpasang (v1.0.0)" when `extAvailable` resolves a version, otherwise "Ekstensi belum terpasang" with a download link `/shelia-maganghub.zip` (`download` attribute), 3 steps (unzip; open `chrome://extensions` with a **Salin** button, since pages can't link to chrome://; turn on Developer mode → **Load unpacked** → pick the folder), and **Cek lagi** that re-runs detection. `extAvailable` returns `{ version } | null`.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement. `deploy.sh` zips `extension/` into `web-app/public/shelia-maganghub.zip` before the build (file git-ignored), so nginx serves it from `dist`.
- [ ] Step 4: `npx tsc -b && npx vitest run` → all pass.
- [ ] Step 5: Commit `feat: use the MagangHub extension when installed, bookmarks otherwise; install status and download`.

### Task 4: Install, live check, deploy

- [ ] Step 1: `./deploy.sh`; build passes.
- [ ] Step 2: User loads `extension/` unpacked (README); confirm ID matches `EXT_ID` on `chrome://extensions`.
- [ ] Step 3: Live: page detects the extension; **Ambil token** returns a token and closes only a tab it created. No real send.
- [ ] Step 4: Commit any fixes; push to `main` only when the user asks.
