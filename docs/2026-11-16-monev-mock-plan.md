# Monev Mock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Monev-style attendance mock + page on test-shelia.holo.my.id, authenticated by the existing Shelia token.

**Architecture:** Zero-dependency Node `http` service (`monev-mock`) in its own container on `proxy-network`; the existing nginx container proxies `/monev-api/v1/` to it and serves `monev.html`/`monev.js` from the deployment folder. The mock validates the Bearer token against Shelia and partitions data by the Cloudflare Access email header.

**Tech Stack:** Node 22 stdlib (`http`, `fs`, `node:test`), nginx 1.29 (`sub_filter`), Docker Compose.

**Spec:** `/Users/arch3nemy7/shelia-test-deploy/docs/2026-11-16-monev-mock-design.md`

## Global Constraints
- Never call any `*.kemnaker.go.id` host; never ask for Kemnaker/SIAPkerja credentials.
- No changes to the kinka1/shelia repo checkout (`/home/Documents/shelia-test/app`).
- Zero npm dependencies; image `node:22-alpine`.
- Token check URL: `https://dev-shelia.shelterapp2.co.id/api/v2/attendance/shifts/available` (env `SHELIA_AUTH_URL`).
- Identity header: `cf-access-authenticated-user-email`.
- Valid-token cache TTL: 60 s.
- Status enum: `PRESENT | PERMIT | SICK`; `activity_log`, `lesson_learned`, `obstacles` required when `PRESENT`.
- Anomaly flags: `weekend`, `holiday`, `backdated`, `future` (dates compared in WIB, UTC+7).
- Local workspace `/Users/arch3nemy7/shelia-test-deploy` (git); VPS `/home/Documents/shelia-test`.

## Review Focus
- Shelia unreachable or 5xx → fail closed with 502, never store the entry.
- Malformed JSON / non-object body → 400; body > 64 KB → 413.
- Malformed or impossible `date` (e.g. `2026-02-30`) → 422 with Monev-style `{message}`.
- Missing Access email header (request not via tunnel) → 401 even with a valid token.
- Data file survives container restart (named volume) and a crash mid-write cannot corrupt it (tmp + rename).

---

### Task 1: Mock server

**Files:**
- Create: `monev-mock/server.js`
- Test: `monev-mock/server.test.js`

**Interfaces:**
- Produces: `createServer({ authUrl, dataFile, now }) → http.Server` (exported; `node server.js` listens on `PORT` default 8080 with `authUrl=process.env.SHELIA_AUTH_URL`, `dataFile=process.env.DATA_FILE || "/data/monev.json"`, `now=() => new Date()`).
- HTTP API (paths relative to mock root, nginx strips `/monev-api/v1`):
  - `POST /attendances/with-daily-log` → 201 `{message:"Absensi berhasil disimpan", data: Entry}`; 409 `{message:"Absensi untuk tanggal ini sudah ada"}` on duplicate (same email + date).
  - `GET /daily-logs?page=1` → `{data: Entry[] (newest date first, 10/page), total, page}`.
  - `GET /holidays?page=1&limit=100` → `{data:[{id,date,name,type:"NATIONAL",scope:"NATIONAL"}], total}`.
  - `GET /health` → 200 `ok` (no auth; used by the container healthcheck).
  - Errors: 401 `{message}` (bad/missing token or missing email), 400/413/422 `{message, errors?}`, 502 `{message}`, 404 `{message:"Not found"}`.
- `Entry = {id, date, status, latitude, longitude, location, activity_log, lesson_learned, obstacles, clock_in:"HH:MM" (server WIB), created_at:ISO, anomalies:string[]}`.

- [ ] **Step 1: Write failing tests** in `server.test.js` using `node:test`. Start a stub Shelia (`http` server returning 200 for `Authorization: Bearer good`, 401 otherwise, 500 when token is `boom`) and the mock with `now = () => new Date("2026-11-16T03:00:00Z")` (Mon 10:00 WIB) and a temp `dataFile`. Tests:
  - `rejects missing token` → 401.
  - `rejects missing access email` → 401 with token `good`.
  - `fails closed when shelia errors` → token `boom` → 502, and `GET /daily-logs` afterwards (token good) has `total === 0`.
  - `stores present entry` → POST date `2026-11-16` → 201, `data.clock_in === "10:00"`, `data.anomalies` deep-equals `[]`.
  - `duplicate date is 409`.
  - `flags anomalies` → `2026-11-14` → `["weekend","backdated"]`; `2026-12-25` → `["holiday","future"]`.
  - `validates` → bad JSON 400; `date:"2026-02-30"` 422; `status:"PRESENT"` with empty `activity_log` 422; `status:"SICK"` without text fields 201.
  - `partitions by email` → a second email sees `total === 0`.
  - `persists` → new server on the same `dataFile` returns the entry.
  - `holidays lists 2026-12-25`.
- [ ] **Step 2: Run** `cd monev-mock && node --test` → FAIL (`createServer` missing).
- [ ] **Step 3: Implement `server.js`.** Token check: `fetch(authUrl, {headers:{Authorization, Accept:"application/json"}})`, `res.ok` → valid; 401/403 → 401; other/throw → 502; cache valid tokens in a `Map` with 60 s expiry. Storage: load JSON once (`{users:{[email]: Entry[]}, nextId}`), write with `writeFileSync(tmp)` + `renameSync`. Holidays: const array of 2026 national holidays (Jan 1, Jan 16, Feb 17, Mar 19, Mar 20, Mar 21, Apr 3, May 1, May 14, May 27, May 31, Jun 1, Jun 16, Aug 17, Aug 25, Dec 25) with Indonesian names; `ponytail:` comment that it's mock data. Date validity: round-trip through `Date.UTC`.
- [ ] **Step 4: Run** `node --test` → all PASS.
- [ ] **Step 5: Commit** `git add monev-mock && git commit -m "feat: monev mock api"`.

### Task 2: Monev page

**Files:**
- Create: `web/monev.html`, `web/monev.js`

**Interfaces:**
- Consumes: Task 1 HTTP API at `/monev-api/v1`; token `localStorage.getItem("absen.token")`; repo `style.css` (served at `/style.css`).
- Produces: page at `/monev.html`.

- [ ] **Step 1: Build the page.** Form fields matching the request body (date default today WIB; status select; latitude/longitude prefilled `-7.308430344545027`/`112.785199930883`; location; three textareas). On submit, POST JSON with `Authorization: Bearer <token>`; show the raw request JSON and the response status + JSON in `<pre>` blocks; reload the list. List table from `GET /daily-logs` with anomaly badges and simple prev/next paging. If no token: message "Login dulu di halaman Shelia" linking `/`. On 401: same message. Link back to `/`.
- [ ] **Step 2: Verify locally** with `node -e` serving `web/` + Task 1 mock behind one origin is overkill — instead verify on VPS in Task 3 (syntax check now: `node --check web/monev.js` → no output).
- [ ] **Step 3: Commit** `git add web && git commit -m "feat: monev page"`.

### Task 3: Wire up and deploy

**Files:**
- Modify: `docker-compose.yml` (add `monev-mock` service, mount `./web` into nginx), `nginx.conf` (new locations + index link)

**Interfaces:**
- Consumes: Task 1 `server.js` (`PORT`, `SHELIA_AUTH_URL`, `DATA_FILE`), Task 2 files.

- [ ] **Step 1: Compose.** Service `monev-mock`: `image: node:22-alpine`, `container_name: shelia-test-monev`, `command: node /srv/server.js`, `volumes: [./monev-mock/server.js:/srv/server.js:ro, monev-data:/data]`, env `SHELIA_AUTH_URL` (Global Constraints) + `DATA_FILE=/data/monev.json`, `read_only: true`, `user: node`, mem 64M, healthcheck `wget -q -O /dev/null http://127.0.0.1:8080/health` (add `GET /health` → 200 `ok` without auth in Task 1 server), networks `[proxy-network]`, no `VIRTUAL_HOST`. Named volume `monev-data`. Nginx service gains `./web:/srv/web:ro`.
- [ ] **Step 2: nginx.** `location = /monev.html` and `= /monev.js` → `root /srv/web`. `location /monev-api/v1/` → `proxy_pass http://shelia-test-monev:8080/;` passing `Authorization` and `cf-access-authenticated-user-email`, `client_max_body_size 64k`. In `location = /` / index: `sub_filter '</body>' '<p class="small" style="text-align:center"><a href="/monev.html">Mock Monev MagangHub</a></p></body>';` (needs `location = /index.html` too, since `/` try_files to it).
- [ ] **Step 3: Deploy.** `scp -r` `docker-compose.yml nginx.conf monev-mock web` to the VPS dir, `docker compose up -d`, wait healthy.
- [ ] **Step 4: Verify on VPS** (Host header via 127.0.0.1): `/monev.html` 200; index contains `monev.html`; `/monev-api/v1/daily-logs` without token → 401; with `Authorization: Bearer bogus` + email header → 401; `docker exec shelia-test-monev wget -qO- https://dev-shelia...` not needed — Shelia reachability shown by 401 (not 502). Public: `https://test-shelia.holo.my.id/monev.html` → 302 to Access.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: deploy monev mock"`.
- [ ] **Step 6: Hand to user** for the one check needing a real login: sign in to Access + Shelia, open `/monev.html`, submit, see entry + raw response (this proves the Access email header reaches the mock and a real Shelia token validates).
