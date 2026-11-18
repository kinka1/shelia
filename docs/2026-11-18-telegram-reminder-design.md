# Telegram channel reminder — design

## Intent

A group of friends (interns, same office, all on the 08:00–17:00 WIB weekday shift) use Phoenix
for their Shelia attendance and MagangHub daily log. The council decided reminders go to one shared
**Telegram channel** (WhatsApp was ruled out: no free official API, ban risk). The channel shows,
per person, who has done which attendance (✅), who has not (❌), on which platform, so people
remind each other and nobody misses the MagangHub deadline (23:59 WIB).

Success: every weekday the channel holds one live table per slot that is always current, nudges
reach people who are late, and nobody's login tokens ever leave their browser.

## Goals

- One **live table** per slot, edited in place as people finish (Telegram `editMessageText`).
- **Nudges** (new messages, so phones buzz) at fixed times, naming only who is still ❌, only while
  someone is still ❌.
- Per person, per platform. A person uses one or two platforms (Shelia, MagangHub).
- Logging out of a platform in Phoenix (the "Keluar" button) removes the person from that column;
  logging out of both removes the row. Logging back in brings them back the same day.
- Works with every laptop closed: runs on the VPS.

## Non-goals

- No per-person private messages. One channel only.
- No verification against Shelia/MagangHub servers. The server never holds tokens.
- No automatic holiday calendar (a manual switch instead, below).
- The Chrome extension reminders stay as they are; this does not replace or change them.
- No bot commands, no webhook. The bot only sends and edits.

## Anti-goals (failure even if it "works")

- Any Shelia or MagangHub token, password or Kemnaker credential reaching the server.
- One friend being able to mark another friend done.
- The bot token in git, in the browser bundle, or in chat.
- Spamming the channel with repeated full tables.
- The bot service reachable from the internet without the Cloudflare Access login.

## Constraints (from the existing project)

- Repo `~/Documents/phoenix` (kinka1/shelia, `main`). Deploy with `./deploy.sh`; VPS folder
  `/home/Documents/phoenix`, compose project `phoenix`, existing container `phoenix-web`
  (nginx:1.29-alpine serving `web-app/dist`, joined to the external `proxy-network`).
- VPS rules: touch only `/home/Documents/phoenix`; never stop or change other containers,
  nginx-proxy or cloudflared; no sudo; no prune.
- Public path: Cloudflare Access (team `spring-haze-8848`, email OTP, Access app "phoenix",
  AUD `4874bc02…`) → tunnel "holo" → nginx-proxy → `phoenix-web`. Friends are let in by adding
  their email to the Access policy.
- Frontend: React 19 + Vite + TS, Vitest. Keep the existing style (TDD, small files).
- All times are Asia/Jakarta (WIB, UTC+7, no DST).

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | Small Node service container (`node:24-alpine`) beside `phoenix-web`: built-in `node:sqlite` for state, built-in `fetch` for Telegram, its own in-process scheduler. No npm runtime dependencies. | One more container; same deploy, same language/tooling as Phoenix. |
| B | Same in Python stdlib. | Second language in a TS project. |
| C | Cloudflare Worker + D1 + Cron Triggers. | Minute-granular cron (23:59:59 approximate), second deploy target and secret store. |

The user picked **A**.

## Decided by the user

**Schedule** (weekdays only; everyone shares it):

| Time (WIB) | Post | Sound |
|---|---|---|
| 07:45 | **Masuk table**: Shelia check-in. Edited live until the slot ends. | 🔔 |
| 07:55, 08:00 | Nudge: Shelia masuk still ❌ | 🔔 |
| 16:45 | **Pulang table**: Shelia pulang (info only) + MagangHub log. Edited live. | 🔔 |
| 17:30, 20:00, 22:00, 23:00 | Nudge: MagangHub log still ❌ | 🔔 |
| 23:30 | Nudge: MagangHub log still ❌ | 🔕 (`disable_notification`) |
| 23:59:59 | **Final result** of the day | 🔕 |

- Shelia **masuk** matters (gets nudges). Shelia **pulang** is optional: shown, never nudged.
- The **MagangHub log** is the important end-of-day item (deadline 23:59).
- Nudges stop once nobody is ❌ for that item. A slot with nobody tracked posts nothing.
- After 23:00 everything is silent.

**Changed 2026-11-18 (user feedback):** an open item shows ⏳ while the day is going and ❌ only at the end of the day (final result, and the live tables are edited to ❌ then); no nicknames (name = Shelia first name, else email local part; MagangHub tokens carry no name); Phoenix shows the channel invite link (Buka channel / Salin link) from `TELEGRAM_INVITE_URL` in `reminder.env`.

**Table format** (a monospace `<pre>` block, parse_mode HTML, names HTML-escaped):

```
⏰ Absen pulang · Rabu 18 Nov · 16:45

Nama     Shelia  MagangHub
───────  ──────  ─────────
Bagas      ✅        ❌
Rina       ❌        –
Dimas      –         ✅

Belum: Bagas (MagangHub)
```

- `–` = the person is not on that platform. ✅/❌ only for platforms they are on.
- Names truncated to 8 characters so columns align on a phone.
- The masuk table has only the Shelia column. The pulang table has Shelia (pulang) and MagangHub (log).
- The "Belum" line lists only items that get nudges (masuk table: Shelia masuk; pulang table:
  MagangHub log), so optional Shelia pulang never appears there.
- Nudge text: `Masih belum absen masuk Shelia: Rina, Dimas` / `Masih belum kirim log MagangHub: Bagas`.
- Final result: same table as pulang, title `Hasil hari ini`, plus `Tidak kirim log: …` or `Semua sudah kirim log ✅`.

**Identity and trust**

- A person = their **Cloudflare Access email**. The server reads it only from a **verified Access
  JWT** (`Cf-Access-Jwt-Assertion`): RS256 signature checked against
  `https://spring-haze-8848.cloudflareaccess.com/cdn-cgi/access/certs` (cached, refreshed on unknown
  `kid`), `aud` = the phoenix Access app AUD, `exp` in the future. The plain
  `Cf-Access-Authenticated-User-Email` header is not trusted on its own (anything on
  `proxy-network` could forge it). Verification uses `node:crypto`, no JWT library.
- A request can only change the row of the email in its own JWT. Email is never shown in the channel.
- Display name: Shelia `full_name` (first word, as it fits the 8-char column) when the person is on
  Shelia; otherwise the local part of the email. A person may set their own short name in Phoenix
  (see below) which overrides both.
- Within the Access circle the server trusts what Phoenix reports (no server-side check with
  Shelia/MagangHub, because that would need tokens).

**What the server stores** (SQLite file in a named volume): per email — display name, on-Shelia,
on-MagangHub; per email per date — masuk, pulang, log booleans; per date per slot — the Telegram
message id of the live table; a holiday flag per date. **History is kept: nothing is deleted
automatically** (user's decision, 2026-11-18). No tokens, no log text, no coordinates.

**Holidays**: a "Libur hari ini" switch in Phoenix, available to the admin only (an
`ADMIN_EMAILS` env var on the server; the user's own Access email). When set for today, nothing
more is posted that day.

## How it works

### Bot service (`reminder/` in the repo, new container `phoenix-reminder`)

- Node 24, TypeScript run with Node's built-in type stripping (no build step), zero runtime deps.
- HTTP on port 8080, **not** joined to the public route: only `phoenix-web` reaches it, over a
  private compose network. `phoenix-web` gets `location /remind-api/ { proxy_pass http://phoenix-reminder:8080/; }`
  and passes the Access JWT header through (unlike the Shelia/MagangHub routes, which strip it).
- Secrets via an env file on the VPS only: `/home/Documents/phoenix/reminder.env`
  (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ACCESS_AUD`, `ACCESS_TEAM`, `ADMIN_EMAILS`),
  mode 600, git-ignored, never copied by `deploy.sh`. The user creates it themselves over ssh;
  the build gives them the exact command.
- Container hardening like `phoenix-web`: read-only root fs, tmpfs `/tmp`, non-root user,
  memory limit, log rotation, healthcheck (`GET /health`), `restart: unless-stopped`.

**API** (all JSON, all require a valid Access JWT):

- `PUT /me` — `{ name?, shelia: boolean, maganghub: boolean }`: which platforms this person is on.
- `PUT /me/today` — `{ date, masuk?, pulang?, log? }`: today's done flags (only `true` moves forward;
  a date that is not today WIB is rejected).
- `GET /me` — what the server holds for this person (for the Phoenix settings view).
- `PUT /holiday` — `{ date, on }`, admin only.
- After any change that affects a live table of today, the server re-renders and edits that table
  (debounced ~5 s so a burst of reports is one edit).

**Scheduler**: a tick every second compares the WIB wall clock with the schedule; each slot event
fires once per date, recorded in SQLite so a restart never double-posts. If the service was down
at a slot's time it does not post late, except that a live table missed because of a restart is
posted on start if its slot is still open. The 23:59:59 final result fires on the second.

**Telegram**: `sendMessage` / `editMessageText` via `fetch` to `https://api.telegram.org/bot<token>/…`.
"message is not modified" on edit is ignored. 429 responses honour `retry_after`. Network failures
retry a few times with backoff; failures are logged without the token.

### Phoenix (web-app)

- A small client `lib/remindApi.ts`: `reportPlatforms`, `reportToday`, `getMe`, `setHoliday`.
  Requests go to `/remind-api/…` same-origin (the Access cookie rides along; nginx forwards the JWT).
  Failures never block attendance: fire-and-forget with a console warning.
- **Platforms**: when Shelia login succeeds → `shelia: true` (with the Shelia name); when MagangHub
  connects → `maganghub: true`. The **Keluar** buttons (Shelia `logout`, MagangHub `disconnect`)
  → false. Token expiry or a 401 is **not** a logout: the person stays tracked (they still owe the
  attendance).
- **Done flags**: reuse the status Phoenix already computes for the extension (`remindStatus` in
  `pages/Absen.tsx`: `masuk`, `pulang`, `log`) and report it whenever it changes, the same moment
  it is sent to the extension today.
- A small "Pengingat Telegram" panel (settings area): shows what the server holds for you
  (name, platforms), lets you edit your short name, and for the admin the "Libur hari ini" switch.
- CSP `connect-src 'self'` already covers `/remind-api/`.

## Settled after review (my calls unless marked)

- **Done flags come only from Phoenix** (user's decision: everyone uses Phoenix). A flag is reported
  the moment the person acts in Phoenix (on any device, phone included), so a closed laptop later
  does not matter. Someone who checks in through the official Shelia app or MagangHub site instead
  stays ❌; that is accepted.
- **Per-platform reporting.** Shelia flags (masuk, pulang) and the MagangHub flag (log) are reported
  independently. A MagangHub-only person must still get `log` reported; today's `status` in
  `Absen.tsx` is empty without a Shelia session, so the reminder report must not depend on it.
- **Report on page load too**, not only on login/connect: every Phoenix load sends `PUT /me`
  (platforms from the persisted sessions) and `PUT /me/today` (current flags). This also covers a tab
  left open overnight (it re-reports on the next status change or reload) and people already logged
  in before this ships.
- **Flags survive a logout/login on the same day**: they are facts about today. Logging out only
  hides the person from that column.
- **Access values** (`ACCESS_AUD`, `ACCESS_TEAM`) live only in `reminder.env`. Tests use a locally
  generated RS256 key pair and fake certs endpoint.
- **Networking and deploy**: a private compose network `phoenix-internal`; `phoenix-reminder` is only
  on it, `phoenix-web` joins it as well as `proxy-network`. nginx resolves the upstream at request
  time (`resolver 127.0.0.11` + a variable in `proxy_pass`), so `nginx -t` and `phoenix-web` work even
  when the reminder container is down (`/remind-api/` then returns 502 and Phoenix ignores it).
  `deploy.sh` brings up the reminder service only when `reminder.env` exists on the VPS, and prints
  the setup command otherwise.
- **Holiday switched on after a table is posted**: the live table is edited to `Libur hari ini` and
  no further nudges or final result are posted that day.
- **Node 24** type stripping only (no enums or parameter properties). `node:sqlite` is acceptable
  even if it prints an experimental warning.

## Left to the builder

- File layout inside `reminder/`, SQLite schema details, test structure (Vitest, like web-app).
- Exact debounce/backoff numbers.
- Where the Pengingat Telegram panel sits in the existing UI and its exact look (follow the
  current shadcn style).
- How `deploy.sh` ships `reminder/` (same tar-over-ssh pattern; `docker compose up -d` for both services).
- Setup instructions for the user: create the bot with @BotFather, create the channel, add the bot
  as admin with "Post messages" and "Edit messages", get the chat id, write `reminder.env`.
