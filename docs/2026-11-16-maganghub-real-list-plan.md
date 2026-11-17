# Real MagangHub List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only card with the user's real MagangHub daily logs on the compare page, token handed over by a bookmarklet.

**Architecture:** `web/maganghub.js` takes the token from the URL fragment into `localStorage` and lists `/maganghub-api/v1/daily-logs`; nginx forwards only those GETs to the real API.

**Tech Stack:** browser JS (no deps), `node:test` + `node:vm`, nginx 1.29, Docker Compose.

**Spec:** `/Users/arch3nemy7/shelia-test-deploy/docs/2026-11-16-maganghub-real-list-design.md`

## Global Constraints
- Real API base: `https://monev-api.maganghub.kemnaker.go.id/api/v1`; only `GET /daily-logs` and `GET /holidays` are forwarded; every other method → 405/403 at nginx, never reaches MagangHub.
- Token: from MagangHub `sessionStorage["monev_access_token"]`; carried only in the URL fragment `#mh=<encodeURIComponent(token)>`; stored only in `localStorage["maganghub.token"]`; sent only as `Authorization: Bearer <token>` to `/maganghub-api/v1/...`. Never written to server disk or logs, never displayed.
- Bookmarklet opens `https://test-shelia.holo.my.id/#mh=…` with `window.open(url, "_blank", "noopener")`; if no token in MagangHub sessionStorage → `alert("Login MagangHub dulu")` (runs on MagangHub's page, not ours).
- Page copy in Indonesian; textContent only for API data; no dependencies; the mock form never calls the real API.
- `web/maganghub.js` must not declare globals (IIFE) — the page shares a global scope with the third-party `app.js` (`const $`, `function api`, `function render`).

## Review Focus
- Token in the fragment must be removed from the address bar (`history.replaceState`) before anything else can read/log it, and must not end up in the Shelia API log (it logs only `/api/` paths — confirm).
- 401 / expired token → clear message telling the user to click the button again; no retry loop.
- Unknown/missing fields in real responses (null `activity_log`, missing `clock_in`, `data` not an array) → render "-" / empty state, never throw.
- nginx: POST/PUT/DELETE to `/maganghub-api/v1/daily-logs` → rejected locally; other paths under `/maganghub-api/` → 404; upstream `Set-Cookie` not passed to the browser; Cloudflare Access headers and cookies not forwarded.
- `/monev.html` standalone and the compare page both show the card; double-loading `maganghub.js` must not double-bind.

---

### Task 1: MagangHub card (`web/maganghub.js`)

**Files:**
- Create: `web/maganghub.js`, `web/maganghub.test.js`
- Modify: `web/monev.html` (card markup at top of `main.container`, plus `<script src="/maganghub.js" defer>`), `web/compare.js` (inject `/maganghub.js` after `/monev.js`)

**Interfaces:**
- Produces: `web/maganghub.js` served at `/maganghub.js`; card container `#mh-card`; pure helpers exported for node via `if (typeof module !== "undefined") module.exports = { takeTokenFromHash, bookmarkletHref }` inside the IIFE:
  - `takeTokenFromHash(hash: string) → string|null` (`"#mh=abc%2B1"` → `"abc+1"`; other/empty → `null`).
  - `bookmarkletHref(origin: string) → string` (a `javascript:` URL implementing the bookmarklet in Global Constraints).
- Consumes: Task 2's `/maganghub-api/v1/daily-logs?page=N` → MagangHub's JSON (`{data:[{id,date,clock_in,status,activity_log,lesson_learned,obstacles,...}], total}` as far as known).

- [ ] **Step 1: Write failing tests** in `web/maganghub.test.js`: `takes token from hash` (`"#mh=abc%2B1"` → `"abc+1"`, `""`/`"#x=1"` → `null`); `bookmarklet reads monev_access_token and opens fragment URL` (evaluate the code after `javascript:` in a `vm` context with stub `sessionStorage.getItem` → `"tok/1"`, stub `window.open` capturing args → URL `https://test-shelia.holo.my.id/#mh=tok%2F1`, target `_blank`); `bookmarklet alerts when logged out` (getItem → null → alert called, open not called); `no globals leak` (run `maganghub.js` in a vm context pre-seeded with `const $`/`function api`/`function render` stubs and a Proxy fake DOM; no throw; stubs unchanged).
- [ ] **Step 2: Run** `node --test web/` → new tests FAIL.
- [ ] **Step 3: Implement** `web/maganghub.js` per the design (token intake + `history.replaceState(null, "", location.pathname + location.search)`, card render, paging, 401 message, "Keluar" clears the token). Guard against double init (`if (document.getElementById("mh-card")?.dataset.ready) return;`). Add the card markup to `monev.html` and the script injection to `compare.js`.
- [ ] **Step 4: Run** `node --test web/` → all PASS; `node --check web/maganghub.js web/compare.js`.
- [ ] **Step 5: Commit** `git add web && git commit -m "feat: real maganghub list card"`.

### Task 2: nginx read-only forward + deploy

**Files:**
- Modify: `nginx.conf`

**Interfaces:**
- Consumes: Task 1 files.
- Produces: `= /maganghub.js` (root `/srv/web`); `= /maganghub-api/v1/daily-logs` and `= /maganghub-api/v1/holidays` → `proxy_pass https://monev-api.maganghub.kemnaker.go.id/api/v1/<same name>` with `limit_except GET { deny all; }`, `proxy_ssl_server_name on`, `proxy_ssl_verify on`, `proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt`, `proxy_ssl_verify_depth 4`, `proxy_set_header Host monev-api.maganghub.kemnaker.go.id`, empty `Origin`, `Referer`, `Cookie`, `Cf-Access-Jwt-Assertion`, `Cf-Access-Authenticated-User-Email`, `proxy_hide_header Set-Cookie`, `access_log off` (belt and braces: no request lines for these paths).

- [ ] **Step 1: Edit** `nginx.conf` as above.
- [ ] **Step 2: Deploy** (backup `nginx.conf` → `nginx.conf.bak4`; copy `nginx.conf` + `web/`; `docker exec shelia-test-web nginx -t`; `docker compose restart web`).
- [ ] **Step 3: Verify on VPS** (Host header): `/maganghub.js` 200; `/maganghub-api/v1/daily-logs` no token → 401 JSON from MagangHub (proves TLS + forwarding); `-H 'Authorization: Bearer bogus'` → 401; `-X POST` → 403 and no upstream call; `/maganghub-api/v1/attendances/with-daily-log` → 404; response has no `Set-Cookie`; `/` 200 and `/monev.html` 200 contain `mh-card` (directly or via compare.js); `/api/auth/login` POST `{}` 422; `/monev-api/v1/daily-logs` 401. Mac: `https://test-shelia.holo.my.id/` 302 to Access. Other containers Up.
- [ ] **Step 4: Commit** `git add nginx.conf && git commit -m "feat: read-only maganghub forward"`.
