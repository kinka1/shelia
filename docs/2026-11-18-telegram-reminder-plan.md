# Telegram Channel Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `phoenix-reminder` service on the VPS posts live ✅/❌ attendance tables and nudges to one Telegram channel, fed by each friend's Phoenix.

**Architecture:** Zero-dependency Node 24 service in `reminder/` (TypeScript via type stripping, `node:sqlite`, `fetch`, `node:crypto`, `node:http`) behind `phoenix-web`'s nginx at `/remind-api/`, identifying people by verified Cloudflare Access JWT. Phoenix reports platforms and done flags to it; a 1-second scheduler posts and edits Telegram messages.

**Tech Stack:** Node 24 (`node:test`, `node:sqlite`), Telegram Bot API, nginx 1.29, Docker Compose; web-app React 19 + Vitest.

**Spec:** `docs/2026-11-18-telegram-reminder-design.md`

## Global Constraints

- No runtime or dev npm dependencies in `reminder/`. Tests: `node --test "reminder/**/*.test.ts"` (Node ≥ 24; local Node is 26).
- TypeScript must be strippable: no `enum`, no parameter properties, no `namespace`; import local files with the `.ts` extension.
- All times Asia/Jakarta (UTC+7, no DST). Weekdays Mon–Fri only.
- No Shelia/MagangHub token, password, log text or coordinates ever sent to or stored by the reminder service.
- A request may only change the row of the email in its own verified Access JWT. Email is never rendered into Telegram.
- Bot token, chat id, Access AUD/team, admin emails: only in `/home/Documents/phoenix/reminder.env` (mode 600, git-ignored, never in the repo, tests or deploy script output).
- History is kept: nothing is deleted automatically.
- VPS: touch only `/home/Documents/phoenix`; never stop or change other containers, nginx-proxy or cloudflared; no sudo; no prune.
- Reminder failures never block attendance in Phoenix (fire-and-forget, `console.warn`).
- Copy (Indonesian) exactly as in the tasks below.

## Review Focus

1. A display name with `<`, `>` or `&` → escaped in every Telegram message (parse_mode HTML would otherwise fail or inject). Test in Task 1.
2. MagangHub token expired or Shelia 401 → the person stays tracked; only the Keluar buttons send `false`. Test in Task 7.
3. Service restarts mid-day → no event posts twice, live tables keep editing the same message ids. Test in Task 5.
4. Weekend, or holiday switched on after the 07:45 table → nothing more is posted, the posted table becomes "Libur hari ini". Test in Task 5.
5. Telegram 429 / network down at a nudge → retried per `retry_after`/backoff, the tick loop never throws. Tests in Tasks 4 and 5.

---

### Task 1: Schedule and message rendering (pure)

**Files:**
- Create: `reminder/schedule.ts`, `reminder/render.ts`
- Test: `reminder/schedule.test.ts`, `reminder/render.test.ts`

**Interfaces:**
- Produces:
  - `type Slot = 'masuk' | 'pulang'`
  - `type Event = { id: string; at: string /* 'HH:MM:SS' */; kind: 'table' | 'nudge' | 'final'; slot: Slot; silent: boolean }`
  - `EVENTS: Event[]` exactly: `masuk-table 07:45:00`, `masuk-nudge-0755 07:55:00`, `masuk-nudge-0800 08:00:00`, `pulang-table 16:45:00`, `pulang-nudge-1730 17:30:00`, `pulang-nudge-2000 20:00:00`, `pulang-nudge-2200 22:00:00`, `pulang-nudge-2300 23:00:00` (all `silent:false`), `pulang-nudge-2330 23:30:00` and `final 23:59:59` (`silent:true`; `final` has slot `pulang`).
  - `wib(now: Date): { date: string /* YYYY-MM-DD */; time: string /* HH:MM:SS */; weekday: boolean }`
  - `TABLE_CLOSE: Record<Slot, string>` = `{ masuk: '16:45:00', pulang: '23:59:59' }` (a missed table may still be posted until then)
  - `type Row = { name: string; shelia: boolean; maganghub: boolean; masuk: boolean; pulang: boolean; log: boolean }`
  - `renderTable(slot: Slot, date: string, rows: Row[]): string`, `renderLibur(date: string): string`, `renderNudge(slot: Slot, rows: Row[]): string | null`, `renderFinal(date: string, rows: Row[]): string` — all HTML for parse_mode HTML.

- [ ] **Step 1: Write the failing tests**

```ts
// schedule.test.ts
test('wib converts to Jakarta wall clock', () => {
  assert.deepEqual(wib(new Date('2026-11-18T00:45:00Z')), { date: '2026-11-18', time: '07:45:00', weekday: true })
  assert.equal(wib(new Date('2026-11-21T01:00:00Z')).weekday, false) // Saturday
  assert.equal(wib(new Date('2026-11-18T17:30:00Z')).date, '2026-11-19') // 00:30 WIB next day
})
test('EVENTS match the agreed schedule', () => {
  assert.deepEqual(EVENTS.map((e) => `${e.at} ${e.kind} ${e.slot} ${e.silent ? '🔕' : '🔔'}`), [
    '07:45:00 table masuk 🔔', '07:55:00 nudge masuk 🔔', '08:00:00 nudge masuk 🔔',
    '16:45:00 table pulang 🔔', '17:30:00 nudge pulang 🔔', '20:00:00 nudge pulang 🔔',
    '22:00:00 nudge pulang 🔔', '23:00:00 nudge pulang 🔔', '23:30:00 nudge pulang 🔕', '23:59:59 final pulang 🔕'])
})

// render.test.ts
const r = (name, o = {}) => ({ name, shelia: false, maganghub: false, masuk: false, pulang: false, log: false, ...o })
const rows = [r('Bagas', { shelia: true, maganghub: true, pulang: true }), r('Rina', { shelia: true }), r('Dimas', { maganghub: true, log: true })]
test('pulang table', () => {
  assert.equal(renderTable('pulang', '2026-11-18', rows), [
    '⏰ <b>Absen pulang</b> · Rabu 18 Nov · 16:45', '',
    '<pre>Nama      Shelia  MagangHub',
    '────────  ──────  ─────────',
    'Bagas       ✅        ❌',
    'Rina        ❌        –',
    'Dimas       –         ✅</pre>', '',
    'Belum: Bagas (MagangHub)'].join('\n'))
})
test('masuk table has only Shelia people and the Shelia column', () => {
  const t = renderTable('masuk', '2026-11-18', rows)
  assert.match(t, /^⏰ <b>Absen masuk<\/b> · Rabu 18 Nov · 07:45/)
  assert.ok(!t.includes('Dimas') && !t.includes('MagangHub'))
  assert.match(t, /Belum: Bagas \(Shelia\), Rina \(Shelia\)$/)
})
test('all done', () => assert.match(renderTable('masuk', '2026-11-18', [r('A', { shelia: true, masuk: true })]), /Semua sudah ✅$/))
test('names are escaped and cut to 8', () => {
  const t = renderTable('pulang', '2026-11-18', [r('<b>&Panjangsekali', { maganghub: true })])
  assert.ok(t.includes('&lt;b&gt;&amp;Pan') && !t.includes('<b>&'))
})
test('nudges', () => {
  assert.equal(renderNudge('masuk', rows), 'Masih belum absen masuk Shelia: Bagas, Rina')
  assert.equal(renderNudge('pulang', rows), 'Masih belum kirim log MagangHub: Bagas')
  assert.equal(renderNudge('pulang', [r('A', { maganghub: true, log: true })]), null)
})
test('final', () => {
  assert.match(renderFinal('2026-11-18', rows), /^🏁 <b>Hasil hari ini<\/b> · Rabu 18 Nov/)
  assert.match(renderFinal('2026-11-18', rows), /Tidak kirim log: Bagas$/)
  assert.match(renderFinal('2026-11-18', [r('A', { maganghub: true, log: true })]), /Semua sudah kirim log ✅$/)
})
test('libur', () => assert.equal(renderLibur('2026-11-18'), '🏖️ <b>Libur hari ini</b> · Rabu 18 Nov'))
```

- [ ] **Step 2: Run** `node --test "reminder/**/*.test.ts"` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `schedule.ts` and `render.ts`. Column layout: name `padEnd(10)` after truncating to 8 code points (escape *after* padding/truncating); a mark cell is the mark with `–` treated as 1 column wide and ✅/❌ as 2, padded so marks line up as in the pulang test. Day names `Minggu…Sabtu`, months `Jan Feb Mar Apr Mei Jun Jul Agu Sep Okt Nov Des`. Rows with neither platform are skipped. Final = pulang table body with the final title and the final last line.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add reminder && git commit -m "reminder: schedule and message rendering"`

### Task 2: Store (`node:sqlite`)

**Files:** Create `reminder/store.ts`; Test `reminder/store.test.ts`

**Interfaces:**
- Consumes: `Row`, `Slot` from Task 1.
- Produces: `openStore(path: string): Store` (use `':memory:'` in tests) with
  - `patchPerson(email: string, p: { nick?: string | null; sheliaName?: string; shelia?: boolean; maganghub?: boolean }): void` (creates the person; only given fields change)
  - `getPerson(email): { email; nick: string | null; sheliaName: string | null; shelia: boolean; maganghub: boolean } | null`
  - `markDone(email, date, f: { masuk?: boolean; pulang?: boolean; log?: boolean }): void` (only `true` values are applied; never un-done)
  - `roster(date): (Row & { email: string })[]` — people with at least one platform, ordered by name; `name` = `nick` ‖ first word of `sheliaName` ‖ email local part
  - `fired(date, eventId): boolean`, `markFired(date, eventId): void`
  - `getMessage(date, slot: Slot): number | null`, `setMessage(date, slot, id: number): void`
  - `isHoliday(date): boolean`, `setHoliday(date, on: boolean): void`

- [ ] **Step 1: Failing tests:** `patchPerson` twice merges (`shelia` stays true when the second call only sets `maganghub`); `markDone(..., { masuk: false })` after `{ masuk: true }` leaves masuk true; `roster` excludes a person with both platforms false and keeps their flags for when they return; display-name precedence (nick > "Bagas" from `sheliaName: 'Bagas Gunawan'` > `rina` from `rina@x.id`); `fired`/`markFired`, `getMessage`/`setMessage`, `isHoliday`/`setHoliday` round-trip; a store reopened on the same file path keeps everything (use a temp file).
- [ ] **Step 2: Run** `node --test "reminder/**/*.test.ts"` — Expected: FAIL.
- [ ] **Step 3: Implement** with `DatabaseSync`, tables `people(email PK, nick, shelia_name, shelia, maganghub)`, `done(email, date, masuk, pulang, log, PK(email,date))`, `fired(date, event, PK)`, `messages(date, slot, message_id, PK(date,slot))`, `holidays(date PK)`. `PRAGMA journal_mode=WAL`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `reminder: sqlite store`

### Task 3: Cloudflare Access JWT verification

**Files:** Create `reminder/access.ts`; Test `reminder/access.test.ts`

**Interfaces:**
- Produces: `createVerifier(o: { team: string; aud: string; fetch?: typeof fetch; now?: () => number }): (jwt: string | undefined) => Promise<string | null>` — returns the lower-cased `email` claim or `null`. Certs from `https://${team}.cloudflareaccess.com/cdn-cgi/access/certs` (`{ keys: JWK[] }`), cached; refetched once when a `kid` is unknown.

- [ ] **Step 1: Failing tests** (generate an RS256 key pair with `crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`, serve its JWK through a fake `fetch`): valid token → email; wrong `aud` → null; `exp` in the past → null; bad signature (signed by another key) → null; `alg: 'none'` → null; missing/garbage header → null; unknown `kid` triggers exactly one refetch.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** with `crypto.createPublicKey({ key: jwk, format: 'jwk' })` and `crypto.verify('RSA-SHA256', ...)`; accept only `alg === 'RS256'`; `aud` may be a string or array.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `reminder: verify Cloudflare Access JWT`

### Task 4: Telegram client

**Files:** Create `reminder/telegram.ts`; Test `reminder/telegram.test.ts`

**Interfaces:**
- Produces: `createTelegram(o: { token: string; chatId: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }): { send(html: string, silent: boolean): Promise<number | null>; edit(messageId: number, html: string): Promise<boolean> }`
  - POSTs JSON to `https://api.telegram.org/bot${token}/sendMessage|editMessageText` with `parse_mode: 'HTML'`, `link_preview_options: { is_disabled: true }`, `disable_notification: silent` (send only).
  - 429 → wait `parameters.retry_after` seconds, retry; network error or 5xx → retry after 1 s, 2 s, 4 s (max 4 attempts) then return `null`/`false`; edit answering "message is not modified" → `true`. Never throws. Logs never contain the token.

- [ ] **Step 1: Failing tests** with a fake `fetch` and `sleep`: send returns `result.message_id`; silent flag passed; 429 with `retry_after: 3` sleeps 3000 then succeeds; 4 network errors → `null` with sleeps `[1000, 2000, 4000]`; "Bad Request: message is not modified" → `true`; an error log written via a stubbed `console.error` does not contain the token.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `reminder: telegram client with retries`

### Task 5: Runner (scheduler + live tables)

**Files:** Create `reminder/runner.ts`; Test `reminder/runner.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces: `createRunner(o: { store: Store; tg: Telegram; now?: () => Date; debounceMs?: number /* default 5000 */ }): { tick(): Promise<void>; changed(date: string): void; holidayChanged(date: string): Promise<void> }`
  - `tick()`: skip unless weekday and not holiday. For each `EVENTS` entry with `time >= at` and not `fired(date, id)`: tables post if `time < TABLE_CLOSE[slot]` and the roster for that slot is non-empty (store the message id); nudges post only within 60 s of `at` and only if `renderNudge` is non-null; `final` posts within 60 s of `at` if anyone is tracked. Mark fired whenever the event is handled (posted or skipped), and only after a successful send when it posts. Errors are caught and logged; `tick` never rejects.
  - `changed(date)`: debounced; re-renders and `edit`s every stored table message of that date (masuk and pulang), unless the final has fired.
  - `holidayChanged(date)`: if now a holiday, edit stored tables of that date to `renderLibur(date)`.

- [ ] **Step 1: Failing tests** (in-memory store, fake tg recording calls, controllable clock):
  - 07:45:00 Wednesday with one Shelia person → one `send` of the masuk table, loud; a second `tick` at 07:45:01 sends nothing.
  - A new runner on the same store (restart) at 07:46 sends nothing more; at 07:55:10 sends the nudge.
  - Started at 09:00 with nothing fired → masuk table is posted (still open), masuk nudges are not.
  - 23:30 nudge is sent with `silent: true`; nudges stop when everyone has `log`.
  - Saturday 07:45 → no sends. Holiday set → no sends; `holidayChanged` after the 07:45 table → `edit(id, renderLibur(...))`.
  - `markDone` + `changed(date)` twice within the debounce → exactly one `edit` per stored table.
  - fake tg `send` rejects → `tick` resolves, event not marked fired, retried on the next tick.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `reminder: scheduler and live tables`

### Task 6: HTTP API, entry point, container, nginx, deploy

**Files:**
- Create: `reminder/server.ts`, `reminder/main.ts`, `reminder/Dockerfile`, `reminder/README.md`
- Modify: `docker-compose.yml`, `nginx.conf`, `deploy.sh`, `.gitignore` (add `reminder.env`)
- Test: `reminder/server.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5; `wib` from Task 1.
- Produces: `createHandler(o: { store; verify: (jwt?: string) => Promise<string | null>; runner; admins: string[]; now?: () => Date }): (req: IncomingMessage, res: ServerResponse) => void`. Routes (prefix already stripped by nginx):
  - `GET /health` → 200 `ok` (no auth).
  - everything else needs `verify(req.headers['cf-access-jwt-assertion'])`, else 401.
  - `GET /me` → `{ name, nick, shelia, maganghub, admin, holiday }` (holiday = today).
  - `PUT /me` → body `{ nick?: string | null, sheliaName?: string, shelia?: boolean, maganghub?: boolean }`; `nick` trimmed, ≤ 20 chars, empty → null; then `runner.changed(today)`; 204.
  - `PUT /me/today` → `{ date, masuk?, pulang?, log? }`; `date` must equal today WIB else 400; then `runner.changed(today)`; 204.
  - `PUT /holiday` → `{ date, on }`; 403 unless email in `admins`; then `runner.holidayChanged(date)`; 204.
  - Body JSON ≤ 4 KB (413 above), wrong types → 400, unknown route → 404.
  - `main.ts`: reads `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ACCESS_TEAM`, `ACCESS_AUD`, `ADMIN_EMAILS` (comma list), exits 1 naming the missing variable (never its value); store at `/data/reminder.db`; `setInterval(runner.tick, 1000)`; listens on `8080`.

- [ ] **Step 1: Failing tests** for `createHandler` with a fake `verify` (`'good'` → `bagas@x.id`): `/health` without auth 200; `/me` without header 401; `PUT /me` merges and `GET /me` reflects it; `PUT /me/today` with yesterday's date 400; `PUT /holiday` by a non-admin 403, by an admin 204 and `holidayChanged` called; 5 KB body 413; `nick: 'x'.repeat(30)` 400.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** server and main.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Infra.**
  - `reminder/Dockerfile`: `FROM node:24-alpine`, `RUN mkdir /data && chown node:node /data`, `COPY *.ts /app/` (exclude tests via `.dockerignore` `*.test.ts`), `USER node`, `CMD ["node", "/app/main.ts"]`.
  - `docker-compose.yml`: service `reminder` (`container_name: phoenix-reminder`, `build: ./reminder`, `env_file: [{ path: reminder.env, required: false }]`, volume `reminder-data:/data`, `read_only: true`, `tmpfs: [/tmp]`, `networks: [phoenix-internal]` only, healthcheck `wget -q --spider http://127.0.0.1:8080/health`, `restart: unless-stopped`, memory 96M, same log rotation as `web`). `web` also joins `phoenix-internal`. Declare `networks.phoenix-internal: {}` and `volumes.reminder-data: {}`.
  - `nginx.conf`: add `remind-api` to the sandbox-CSP map regex; new `location /remind-api/ { resolver 127.0.0.11 valid=10s; set $reminder http://phoenix-reminder:8080; rewrite ^/remind-api/(.*)$ /$1 break; proxy_pass $reminder; proxy_set_header Cookie ""; client_max_body_size 8k; }` (the Access JWT header passes through; do not strip it here).
  - `deploy.sh`: also tar `reminder/` (without tests) to `$DEST/reminder`; remote step runs `docker compose up -d --force-recreate --remove-orphans web` as now, then `if [ -f reminder.env ]; then docker compose up -d --build reminder; else echo 'reminder.env missing: see reminder/README.md'; fi`.
  - `reminder/README.md`: BotFather steps, create channel, add bot as admin with Post + Edit messages, get the chat id, then on the VPS: `install -m 600 /dev/null /home/Documents/phoenix/reminder.env && nano /home/Documents/phoenix/reminder.env` with the five variable names (no values), then `./deploy.sh`.
- [ ] **Step 6: Verify** `node --test "reminder/**/*.test.ts"` PASS; `docker compose config -q` succeeds locally; `docker run --rm -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.29-alpine nginx -t` → "syntax is ok" (if Docker is unavailable locally, deploy.sh's remote `nginx -t` is the check).
- [ ] **Step 7: Commit** `reminder: http api, container, nginx route, deploy`

### Task 7: Phoenix reporting and the Pengingat Telegram panel

**Files:**
- Create: `web-app/src/lib/remindApi.ts`, `web-app/src/features/remind/RemindPanel.tsx`
- Modify: `web-app/src/pages/Absen.tsx`, `web-app/src/features/session/SessionProvider.tsx` (`logout`), `web-app/src/features/maganghub/MagangHubCard.tsx` (Keluar button)
- Test: `web-app/src/lib/remindApi.test.ts`, `web-app/src/features/remind/RemindPanel.test.tsx`, additions to `web-app/src/pages/Absen.test.tsx`

**Interfaces:**
- Consumes: Task 6 routes.
- Produces (`remindApi.ts`, all same-origin `fetch('/remind-api/...')`, never throw, `console.warn` on failure):
  - `remindPlatforms(p: { shelia?: boolean; maganghub?: boolean; sheliaName?: string }): Promise<void>` → `PUT /me`
  - `remindToday(date: string, f: { masuk?: boolean; pulang?: boolean; log?: boolean }): Promise<void>` → `PUT /me/today`, skipped when no flag is true
  - `remindMe(): Promise<RemindMe | null>` → `GET /me`, `null` on any failure; `type RemindMe = { name: string; nick: string | null; shelia: boolean; maganghub: boolean; admin: boolean; holiday: boolean }`
  - `remindNick(nick: string | null): Promise<boolean>`, `remindHoliday(date: string, on: boolean): Promise<boolean>`

- [ ] **Step 1: Failing tests:**
  - `remindApi.test.ts`: each function hits the right method/path/body; a rejected `fetch` resolves (no throw); `remindToday(d, { masuk: false })` makes no request.
  - `Absen.test.tsx`: logged in to Shelia with `employee.full_name` → `PUT /me {shelia:true, sheliaName}`; MagangHub connected → `PUT /me {maganghub:true}`; Shelia today done → `PUT /me/today {date, masuk:true}`; log sent (`sentAt`) with **no Shelia session** → `PUT /me/today {date, log:true}`; an expired MagangHub token / Shelia 401 never sends `shelia:false` or `maganghub:false`.
  - Shelia Keluar → `PUT /me {shelia:false}`; MagangHub Keluar → `PUT /me {maganghub:false}`.
  - `RemindPanel.test.tsx`: `remindMe()` null → renders nothing; otherwise heading "Pengingat Telegram", text "Nama di channel: Bagas", platforms line "Shelia ✅ · MagangHub –", a "Nama pendek" input + "Simpan" calling `remindNick`; the "Libur hari ini" switch only when `admin`, calling `remindHoliday(todayWIB(), true)`.
- [ ] **Step 2: Run** `cd web-app && npx vitest run` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** In `Absen.tsx`, report independently: Shelia platform + flags from `token`/`employee`/`shelia.today` (`sheliaDone`, `remindStatus` logic), MagangHub platform from `mhConnected === true`, `log` from `sentAt` — not gated on the Shelia session. Only `true` is ever reported from Absen; `false` only from the two Keluar handlers. Render `<RemindPanel />` as a Card below the two forms, in the current shadcn style.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b` — Expected: all pass, TSC clean.
- [ ] **Step 5: Commit** `phoenix: report to the Telegram reminder and add its panel`

### Task 8: Ship

- [ ] **Step 1:** `./deploy.sh` — Expected: nginx -t ok, `phoenix-web` recreated, message `reminder.env missing` (first run).
- [ ] **Step 2:** Through nginx-proxy on the VPS: `curl -s -H 'Host: phoenix.holo.my.id' http://127.0.0.1/remind-api/health` from inside `nginx-proxy` → 502 while the service is off, and the site itself still serves `<title>Phoenix`.
- [ ] **Step 3:** Hand the user `reminder/README.md` steps. After they create `reminder.env`, re-run `./deploy.sh` → `phoenix-reminder` healthy; `/remind-api/health` → `ok`. Do not post to the channel on the user's behalf beyond the normal schedule.
