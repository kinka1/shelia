# Monev mock on the Shelia test site — design

## Intent
Let the three allowed testers try a MagangHub Monev-style attendance flow next to Shelia's,
on test-shelia.holo.my.id, without touching Kemnaker's real system. Purpose: compare the two
flows (one trusting JSON POST vs Shelia's server-driven, face-verified chain).

## Goals
- Mock of the Monev endpoints we observed (from the public auto-absen-maganghub client):
  - `POST /attendances/with-daily-log` — body `{date, status, latitude, longitude, location,
    activity_log, lesson_learned, obstacles}`; `409` if the user already has an entry for `date`.
  - `GET /daily-logs?page=` → `{data:[{id,date,clock_in,activity_log,lesson_learned,obstacles,...}], total}`.
  - `GET /holidays?page=&limit=` → `{data:[{id,date,name,type,scope}], total}`.
- No separate login: reuse the Shelia token the test site already stores (`localStorage["absen.token"]`).
- A page `/monev.html` with the Monev form, the user's entries, and the raw request/response.

## Non-goals / anti-goals
- Never call or proxy to any `*.kemnaker.go.id` host. Never collect SIAPkerja/Kemnaker credentials.
- No changes to the kinka1/shelia repo.
- Not a faithful replica of Monev's hidden server rules (we don't know them).

## Constraints
- Same deployment as today: VPS `/home/Documents/shelia-test`, nginx container on `proxy-network`,
  behind Cloudflare Access (3 allowed emails) and the "holo" tunnel.
- Ponytail: no dependencies, fewest files.

## Approaches
1. **Node mock service, zero deps (chosen).** `node:22-alpine` container, stdlib `http`, JSON file
   on a volume. Matches the repo's own dependency-free `server.js`. Real HTTP, so 401/409 and raw
   bodies are genuine.
2. Browser-only mock (localStorage, no server). Simplest, but no real network calls or
   token check, so it can't show the request/response the way an API would.
3. nginx-only (auth_request + static JSON). Can't store entries or return 409.

## Design
- **Routing:** existing nginx adds `location /monev-api/v1/` → `http://monev-mock:8080/`, and serves
  `/monev.html` + `/monev.js` from the deployment folder (not the repo checkout). Index page gets a
  link to `/monev.html` injected with `sub_filter` (repo untouched).
- **Auth:** mock forwards the request's `Authorization` header to Shelia
  `GET https://dev-shelia.shelterapp2.co.id/api/v2/attendance/shifts/available`; 2xx = valid,
  401 = reject with Monev-style `{message}` 401. (Verified: Shelia returns 401 for bad/missing token.)
  Valid tokens cached in memory for 60 s to avoid hammering Shelia.
- **Identity / partitioning:** `Cf-Access-Authenticated-User-Email` header set by Cloudflare Access
  (trusted: origin is only reachable via the tunnel). Missing header → 401.
- **Behaviour:** accepts any client-sent date and coordinates (like Monev). Server records
  `clock_in` = server time (WIB) and `created_at`. Adds `anomaly` flags: `weekend`, `holiday`,
  `backdated`, `future` — shown in the UI to illustrate what Monev-style checks would catch.
  `status` must be `PRESENT|PERMIT|SICK`; the three text fields required for PRESENT.
- **Holidays:** small static list in the mock (my call: a handful of 2026 national holidays, editable).
- **Storage:** one JSON file on a named volume, written atomically (tmp + rename). Plenty for 3 testers.

## Left to the builder
Exact UI layout (reuse the repo's `style.css`), holiday list contents, field validation messages.
