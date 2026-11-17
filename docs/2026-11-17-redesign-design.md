# Test site redesign: Metronic/shadcn app — design

## Intent
The user (an intern on the Shelia team) wants to see and use the test site as an expert UI/UX
engineer would design it: Laws of UX, Nielsen's 10 heuristics, WCAG AA, and the look of the team's
admin panel (a Metronic replica built with shadcn). It must be a working app, not a mockup: the user
checks in on Shelia, fills the MagangHub daily log, and reads both histories from here every day,
so "everything in one place, without hunting for it" is the success test.

## Goals
- A React + shadcn app with four pages in a dark left rail, approved in mockup revision 8
  (copied to `docs/2026-11-17-redesign-mockup.html`; open it in a browser):
  1. **Absen** — Shelia check-in/out (left) and MagangHub daily log (right) on one page.
  2. **Riwayat Shelia** — table of sessions with admin-panel pagination.
  3. **Riwayat MagangHub** — the user's real MagangHub logs, read-only, with pagination; long texts
     clamped in the table, full text in a side panel.
  4. **Log API** — technical log made readable: grouped by action, plain-language titles, error
     explanations, full JSON detail.
- Same Shelia behaviour as today's client (parity), same MagangHub read path, same mock write path.

## Non-goals / anti-goals
- No change to the kinka1/shelia app files (`app.js`, `index.html`, `style.css`, `server.js`) — the
  new app is separate; the original page stays reachable at `/classic/`.
- No writes to the real MagangHub; the daily-log form writes only to our mock (the user knows; the
  UI must not say "mock", "test server" or "Monev" anywhere).
- No new secrets handling on the server; no storing tokens server-side; no Kemnaker password.
- Anti-goal: anything that makes a page harder to find or read than the mockup (Jakob's law: it must
  feel like the admin panel the team already uses).

## Constraints
- Stack copied from the admin panel (`~/Documents/ubuntu-vps/admin-panel`): Vite 7, React 19,
  TypeScript 5.8, Tailwind 3.4, shadcn new-york, lucide-react, sonner, react-router-dom 7.
  Tokens from its `src/index.css` + `tailwind.config.ts` and rules from its `DESIGN.md` (dark rail,
  canvas, white bordered cards, one Signal Blue per region, status = label + icon + tint, Inter,
  36px controls, Indonesian copy without dashes, light and dark themes).
- Components copied (not imported) from its `src/components/ui-kit` as needed (button, card, badge,
  input, textarea, label, select, table, tabs, sheet, dialog, tooltip, skeleton, sonner, separator),
  and its `ListPagination` from `src/components/patterns/data-grid/DataGrid.tsx` (rows-per-page
  select, "1-10 dari 34", "Ke halaman" jump when pages are skipped, ‹ numbers ›, current page filled).
- Contrast fix over the admin panel: white text on the primary button uses a darker blue
  (≈ `hsl(212 100% 42%)`) so it meets 4.5:1.
- Lives in the deploy repo as `web-app/`; built on the Mac (`npm run build`), the `dist/` is copied
  to the VPS and served by the existing nginx container. Nothing new runs on the VPS.
- Same origin, same API routes: `/api/` (Shelia), `/monev-api/v1/` (mock, write),
  `/maganghub-api/v1/daily-logs` and `/holidays` (real MagangHub, GET only). All existing nginx
  protections stay (Access, proxied-response CSP sandbox, header stripping, GET-only forward).
- The app's own HTML gets a strict CSP (`default-src 'self'`; no inline script; `connect-src 'self'`;
  `img-src 'self' blob: data:`; `media-src 'self' blob:` for the camera), because localStorage holds a
  Shelia token and a government-site token.

## Approaches
1. **New React app in the deploy repo (chosen by the user).** Full control over flow and copy;
   ports Shelia's client logic into typed, tested modules.
2. Restyle around the untouched Shelia client — rejected: Shelia's own screens keep their layout and
   copy, so most usability fixes would be cosmetic.
3. Clickable mockup only — rejected: the user wants to use it daily.

## Design

### Shell (every page)
Dark rail: brand, sections **Absensi** (Absen), **Riwayat** (Riwayat Shelia, Riwayat MagangHub),
**Alat** (Log API). Active item = lighter rail fill + white text + blue dot (no side stripe).
Header: breadcrumb, date chip, theme toggle (system/light/dark), user avatar menu with Keluar
(logs out of Shelia). Rail collapses to a sheet below `lg`; content stacks to one column on phones.

### Login (shown instead of the shell when no Shelia token)
Centered card, email + password, show-password toggle, inline errors from the API message, busy
button. Same request and storage as today (`POST /api/auth/login`, `localStorage["absen.token"]`,
`["absen.employee"]`).

### Page 1 · Absen
- Title "Absen hari ini" + one-line status ("Shelia: belum masuk. MagangHub: belum diisi.").
- **Shelia card** — 3-step stepper (Shift → Foto wajah → Kirim) driven by `user/today`:
  shift select from `v2/attendance/shifts/available`; camera (getUserMedia) or "Unggah foto" (≤ 10 MB);
  `POST v2/attendance/face/verify` → face token with expiry shown as a countdown; check-in/out
  multipart exactly as today (`lat`/`lng` from the fixed config, `platform=web`, `shift_id`,
  `attendance_id` on check-out, `reason` when `required_note`, `face_token` or
  `face_bypass_token` + `file_photo`). Parity cases: face not enrolled warning (blocks), outside area
  block, required note with recent reasons, RELOAD_CODES → reload today, bypass flow, review-reason
  labels, today's sessions listed under the card. Success → toast + refresh.
- **MagangHub card** — header: connection badge (Terhubung / Belum terhubung / Kedaluwarsa), token
  expiry time if known, **Perbarui token** button (opens a small dialog with the "→ Shelia" bookmark
  to drag and 3 numbered steps; the hand-off logic stays as built: `#mh=` fragment →
  `localStorage["maganghub.token"]`, fragment stripped on load before rendering).
  Form: Tanggal (default today WIB), Status locked "Hadir", Lokasi locked "Surabaya", then
  **Aktivitas, Pembelajaran, Kendala** as three equal textareas, each min **100 characters** with a
  live counter (amber "x / 100 · kurang n" → green "✓ n karakter"); **Kirim log** disabled with
  "Lengkapi n isian lagi" until all three pass. Posts to `/monev-api/v1/attendances/with-daily-log`.
  The mock server also enforces 100 characters (422 with field errors) so it can't be skipped.
- No request/response log on this page.

### Page 2 · Riwayat Shelia
Table: Tanggal, Shift, Masuk, Pulang, Status (badge). Shelia's API only returns today, so the app
records each day's sessions it sees in `localStorage["shelia.history"]` (keyed by date, newest
replaces) and the table shows today live + stored days. No explanatory note. Search box, Muat ulang,
admin-panel pagination (10 per page default).

### Page 3 · Riwayat MagangHub
Table: Tanggal, Masuk, Status, Aktivitas, Pembelajaran, Kendala, Lihat. Three text columns equal
width, each clamped to 2 lines. Row click or **Lihat** opens a right Sheet with all three texts in
full and ‹ Sebelumnya / Berikutnya › to step days without closing. Closed by default; Esc, ✕ or
overlay closes; focus returns to the row. Pagination from the API (`page`, `total`). Not connected
or expired → empty state with a button to the Absen page's Perbarui token dialog. No tabs.

### Page 4 · Log API
- Captures every same-origin call the app makes to `/api/`, `/monev-api/`, `/maganghub-api/`
  (one fetch wrapper inside the app — no monkey-patching needed any more), in memory only, newest
  first, max 200.
- List grouped by user action ("Absen masuk · 08:02", "Masuk ke akun · 07:55", "Kirim log harian",
  "Muat riwayat MagangHub"): the action that triggered the calls names the group.
- Each row: method chip, plain-language title from a fixed endpoint map (unknown → raw path), status
  badge, path + duration in mono.
- Filters: source segmented (Semua / Shelia / MagangHub), status (Semua / Gagal (n)), search.
  **Bersihkan** clears.
- Detail (right): plain-language summary box (red for failures, using the Shelia error messages the
  client already has plus a small code→explanation map), meta tiles (Metode, Status, Durasi,
  Waktu), tabs Request / Response / Header, highlighted JSON with **Salin**.
- Redaction as today: `password`, `token`, `access_token`, `face_token`, `bypass_token`,
  `face_bypass_token` (any depth, any case) and `Authorization` → "disembunyikan" chip; files →
  "[file name, N KB]"; secret query params redacted.

### Applied principles (where they show up)
Hick's law and Miller's law: 4 rail items, one primary action per card. Jakob's law: admin-panel
look and pagination. Fitts's law: 36px+ controls, primary buttons at the end of the reading path.
Goal-gradient and progress visibility: stepper, character counters, "Lengkapi n isian lagi".
Nielsen: system status (badges, countdown, toasts), match the real world (Indonesian, plain titles),
error prevention (disabled submit, locked fields, validation before send), recognition over recall
(plain log titles), error recovery (plain explanations with the next step), consistency (one
pagination, one card style). WCAG AA: contrast, focus rings, labels, keyboard Sheet, reduced motion.

## Calls made after the builder check (mine, check them)
1. **Absen status for MagangHub** reads the mock's `GET /monev-api/v1/daily-logs` for today (that's where
   the form writes); after a successful send the card shows "Terkirim" with the time and the form locks
   for that date. Riwayat MagangHub shows real MagangHub logs only (no mock entries, per the user).
2. **Page size on Riwayat MagangHub:** the real API is only known to take `page`, so that page hides the
   rows-per-page select and shows the pager with the size the API returns. Riwayat Shelia (local data)
   keeps the select.
3. **Routing and nginx:** in scope. `BrowserRouter` (not HashRouter, which would clash with `#mh=`),
   nginx serves `web-app/dist` at `/` with `try_files $uri /index.html`; the classic page and its
   `sub_filter` injections move under `/classic/` unchanged. Compose mounts `web-app/dist` read-only.
4. **100-character rule** applies to every request the mock receives; the classic compare card and
   `monev-mock/server.test.js` fixtures are updated to send valid lengths.
5. **CSP:** scripts strict (`script-src 'self'`); `style-src 'self' 'unsafe-inline'` because Radix/sonner
   inject inline styles.
6. **MagangHub expiry:** decode the JWT `exp` in the browser (no verification, display only) for
   "berlaku sampai"; a 401/403 from the API also flips the badge to Kedaluwarsa.

## Left to the builder
Exact component composition, icon choices, empty/loading skeletons, toast wording, the endpoint
title map and code explanations beyond the cases named above, test layout (Vitest for ported logic:
API client + error mapping, redaction, log grouping, history store, 100-char validation).
