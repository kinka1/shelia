# Compare Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shelia page and Monev mock side by side on `/`, with a redacted Shelia API log.

**Architecture:** nginx `sub_filter` injects a wrapper, `#monev-col`, `compare.css`, `api-log.js` (before `app.js`) and `compare.js` into the repo's `index.html` as served. `api-log.js` wraps `fetch`; `compare.js` mounts `/monev.html` content + `monev.js` into the right column.

**Tech Stack:** browser JS (no deps), `node:test` for the pure redaction logic, nginx 1.29 `sub_filter`, Docker Compose.

**Spec:** `/Users/arch3nemy7/shelia-test-deploy/docs/2026-11-16-compare-page-design.md`

## Global Constraints
- No change to `/home/Documents/shelia-test/app` (repo checkout) or to Shelia's behaviour.
- No dependencies, no external URLs; never call `*.kemnaker.go.id`.
- Redaction: JSON keys `password`, `token`, `access_token`, `face_token`, `bypass_token`, `face_bypass_token` (any depth, case-insensitive) → `"***"`; `Authorization` header → `Bearer ***`; File/Blob → `[file <name>, <N> KB]` (KB = ceil(size/1024)); FormData fields with those key names → `***`.
- Log: same-origin paths starting `/api/` only; newest first; max 50; nothing persisted or sent.
- Layout breakpoint: two columns at `min-width: 900px`, stacked below.
- Server data/user text rendered with `textContent` only.

## Review Focus
- `fetch` called with a `Request` object or a `URL` instead of a string → still logged (or passed through untouched), never broken.
- Response that isn't JSON (HTML error page, empty 204) → logged as text/empty, the app still receives an unread, usable response (logger reads a `clone()`).
- `fetch` rejection (network error) → logged as error and the original rejection still reaches `app.js`.
- `monev.js` loaded after the DOM is ready → it must still initialise (no reliance on a `DOMContentLoaded` that already fired).
- Shelia logout → Monev column shows the "login dulu" state after refresh.

---

### Task 1: API recorder (`web/api-log.js`)

**Files:**
- Create: `web/api-log.js`, `web/api-log.test.js`

**Interfaces:**
- Produces (exported via `if (typeof module !== "undefined") module.exports = { redactJson, redactHeaders, describeBody }`, and attached to `window.apiLog` in the browser):
  - `redactJson(value) → value` (deep copy, secrets → `"***"`).
  - `redactHeaders(headersInit) → object` (plain object; `Authorization` → `"Bearer ***"`).
  - `describeBody(body) → string|object|null` (JSON string → redacted object; `FormData` → object of entries with files as `[file name, N KB]` and secret keys `***`; `null/undefined` → `null`; other strings returned as-is).
- Browser behaviour: wraps `window.fetch` at load; for `/api/` same-origin calls records `{at, method, path, request: {headers, body}, status | error, ms, response}` (response parsed from `res.clone()` as JSON → redacted, else text truncated to 2000 chars); renders a `<section id="shelia-log" class="card">` appended to the first `main.container` once the DOM is ready; dispatches `new CustomEvent("api-log", { detail: entry })` on `window`.

- [ ] **Step 1: Write failing tests** (`node:test`): `redacts nested secrets` (`{password:"p", data:{token:"t", employee:{name:"A"}}, meta:{bypass_token:"b"}}` → secrets `***`, `name` kept, input not mutated); `redacts case-insensitively` (`{Face_Token:"x"}`); `redacts authorization header` (from a plain object and from a `Headers` instance); `describes formdata` (`lat:"1"`, `face_token:"x"`, `file_photo: new File([new Uint8Array(2048)], "selfie.jpg")` → `{lat:"1", face_token:"***", file_photo:"[file selfie.jpg, 2 KB]"}`); `parses json string body`; `null body`.
- [ ] **Step 2: Run** `node --test web/` → FAIL (module missing).
- [ ] **Step 3: Implement** `web/api-log.js` (pure functions + browser wrapper guarded by `typeof window !== "undefined"`).
- [ ] **Step 4: Run** `node --test web/` → PASS; `node --check web/api-log.js` → no output.
- [ ] **Step 5: Commit** `git add web/api-log.js web/api-log.test.js && git commit -m "feat: shelia api recorder"`.

### Task 2: Compare layout + Monev mount

**Files:**
- Create: `web/compare.js`, `web/compare.css`
- Modify: `web/monev.js` (expose `window.monevRefresh`; must initialise when loaded after DOM ready)

**Interfaces:**
- Consumes: Task 1 `api-log` window event (`detail.method`, `detail.path`, `detail.status`).
- Produces: `#monev-col` filled with the content of `/monev.html`'s `main.container` (drop its top-bar back link to `/`); `window.monevRefresh()` = reset auth message + reload list page 1; `compare.js` calls it on `api-log` events for `POST /api/auth/login` with status 200 and for `/api/auth/logout`.
- `compare.css`: `.compare` grid, two columns ≥ 900px (each column keeps `.container` padding; max overall width ~1000px), one column below; `#shelia-log pre` scrollable (`max-height`, `overflow:auto`, `white-space: pre-wrap`).

- [ ] **Step 1: Implement** the three changes.
- [ ] **Step 2: Verify** `node --check web/compare.js web/monev.js` → no output; `node --test web/` still PASS; `/monev.html` standalone behaviour unchanged (monev.js still initialises when loaded by its own page).
- [ ] **Step 3: Commit** `git add web && git commit -m "feat: compare layout and monev mount"`.

### Task 3: nginx wiring + deploy

**Files:**
- Modify: `nginx.conf`

**Interfaces:**
- Consumes: `web/api-log.js`, `web/compare.js`, `web/compare.css`, `web/monev.html`, `web/monev.js` served from `/srv/web`.

- [ ] **Step 1: nginx.** Serve `= /api-log.js`, `= /compare.js`, `= /compare.css` from `root /srv/web` (like `/monev.js`). Exclude `api-log.test.js` (not served). In BOTH `location = /` and `location = /index.html`, replace the old footer-link `sub_filter` with: `'<link rel="stylesheet" href="style.css">'` → same + `<link rel="stylesheet" href="/compare.css">`; `'<main class="container">'` → `<div class="compare"><main class="container">`; `'<script src="app.js"></script>'` → `<section id="monev-col" class="container"></section></div><script src="/api-log.js"></script><script src="app.js"></script><script src="/compare.js" defer></script>`.
- [ ] **Step 2: Deploy** `nginx.conf` + `web/` to `/home/Documents/shelia-test` (backup `nginx.conf` → `nginx.conf.bak3` first), `docker compose up -d`, `docker compose restart web`.
- [ ] **Step 3: Verify on VPS** (Host header): `/` 200 and body contains `compare.css`, `id="monev-col"`, `/api-log.js` before `app.js`, and NOT the old `monev.html` footer link; `/api-log.js`, `/compare.js`, `/compare.css` 200; `/api-log.test.js` 404; `/monev.html` 200; `/api/auth/login` POST `{}` 422; `/monev-api/v1/daily-logs` no auth 401. Mac: `https://test-shelia.holo.my.id/` 302 to Access.
- [ ] **Step 4: Commit** `git add nginx.conf && git commit -m "feat: deploy compare page"`.
