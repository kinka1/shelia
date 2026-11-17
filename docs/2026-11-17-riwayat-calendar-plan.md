# Riwayat Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Riwayat Shelia and Riwayat MagangHub with one `/riwayat` page: a month calendar card coloured by Shelia attendance, ✓ for MagangHub logs, day details below.

**Architecture:** `lib/riwayat.ts` holds the pure month logic (status grouping, day list, counts) and the two month fetchers. `pages/Riwayat.tsx` renders the card (header, calendar, legend, counts, day details). Routes and sidebar collapse to one item; the browser-saved Shelia history module is deleted.

**Tech Stack:** React 19, Vite, TypeScript, Vitest + RTL, Tailwind/shadcn (Metronic replica).

**Spec:** `docs/2026-11-17-riwayat-calendar-design.md`

## Global Constraints

- Status grouping (lower-cased) copied from the admin panel: CUTI = leave, annual_leave; IZIN = day_off, permission, sick; TERLAMBAT = late, completedlate, done_late (or `check_in.status` late); DINAS = business_trip, completedtrip; HADIR = completed, checked_in, checked_out, pending_review, done, on_break, corrected, present; anything else = tidak_hadir. Several sessions in a day: terlambat beats hadir.
- Labels: Hadir, Terlambat, Izin, Cuti, Dinas, Tidak hadir, Belum absen, Libur, Tidak ada catatan; legend extra "✓ Log MagangHub terkirim".
- Tones: hadir success (green), terlambat warning (yellow), izin/cuti/dinas info (purple), tidak_hadir destructive (red), belum warning, libur/kosong muted grey. Use the existing `*-ink` / tint tokens in `index.css`.
- Dates are handled as `YYYY-MM-DD` strings in Jakarta time (`todayWIB`); never `new Date(attendance_date)`.
- Shelia endpoint: `GET /v2/attendance/user/month?month=YYYY-MM` via `sheliaApi`, body `{ status, message, data: rows[] }`.
- MagangHub: `fetchDailyLogs(page)`, newest first; stop at an empty page, a page whose oldest log is before the month, or page 10.

## Review Focus

- Switching months fast: an older month's answer must not overwrite the newer one (sequence guard) — test in Task 2.
- Shelia logged out or MagangHub disconnected: the other source still colours/marks the calendar, with a one-line notice — test in Task 2.
- `attendance_date` with a time part ("2026-11-03 00:00:00") maps to day 3, not day 2 in UTC — test in Task 1.
- A month with no rows at all: weekdays read "Tidak ada catatan", not "Tidak hadir" — test in Task 1.
- Future month: › disabled; future days plain, not "Tidak ada catatan" — tests in Tasks 1 and 2.

---

### Task 1: Month logic and fetchers

**Files:**
- Create: `web-app/src/lib/riwayat.ts`, `web-app/src/lib/riwayat.test.ts`

**Interfaces:**
- Produces:
  - `type Bucket = 'hadir' | 'terlambat' | 'izin' | 'cuti' | 'dinas' | 'tidak_hadir' | 'belum' | 'libur' | 'kosong' | 'nanti'` (`nanti` = future day, plain)
  - `type SheliaRow = { attendance_date: string; status?: string | null; shift?: { name?: string } | null; check_in?: { check_in_time?: string | null; status?: string | null } | null; check_out?: { check_out_time?: string | null } | null }`
  - `const BUCKET: Record<Bucket, { label: string; tone: string }>`
  - `bucketOf(status?: string | null, checkInStatus?: string | null): Bucket` (grouping only)
  - `type CalDay = { date: string; bucket: Bucket; sessions: SheliaRow[]; log: MhLog | null }`
  - `monthDays(period: string, rows: SheliaRow[], logs: MhLog[], today: string): CalDay[]`
  - `monthCounts(days: CalDay[], today: string): { hadir: number; workDays: number; terlambat: number; tidakHadir: number; logs: number }` — hadir includes terlambat; workDays = Mon–Fri up to today in the month.
  - `fetchSheliaMonth(period: string): Promise<SheliaRow[] | { error: string }>`
  - `fetchMhMonth(period: string): Promise<{ status: MhStatus; logs: MhLog[]; error?: string }>`

- [ ] **Step 1: Write the failing tests** in `riwayat.test.ts`:
  - `bucketOf`: each set above maps right; `'Completedlate'` → terlambat (case); `checked_in` with check-in status `late` → terlambat; `'weird'` and `null` → tidak_hadir.
  - `monthDays('2026-11', rows, logs, '2026-11-17')`: 30 days; a row dated `'2026-11-03 00:00:00'` lands on `2026-11-03`; two sessions on one day (hadir + late) → terlambat; a log dated `2026-11-03` sets `log`; Sat `2026-11-07` without row → libur; Mon `2026-11-09` without row → kosong; today `2026-11-17` without row → belum; `2026-11-18` → nanti.
  - `monthCounts` on that month: workDays 12 (Mon–Fri 2–17 Nov), hadir counts terlambat days too, logs counts days with a log.
  - `fetchSheliaMonth('2026-11')`: calls `/api/v2/attendance/user/month?month=2026-11` with the Bearer token and returns `data`; a 500 → `{ error }`.
  - `fetchMhMonth('2026-11')`: page 1 has Nov logs, page 2 has an Oct log → stops after page 2, returns only Nov logs; no token → `{ status: 'none', logs: [] }`.
- [ ] **Step 2: Run** `npx vitest run src/lib/riwayat.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `lib/riwayat.ts` per the interfaces; weekday from `new Date(\`${date}T00:00:00+07:00\`).getUTCDay()` shifted, or `Date.UTC` on the parts.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Riwayat month logic (admin-panel status groups) and month fetchers`

### Task 2: Riwayat page (calendar card)

**Files:**
- Create: `web-app/src/pages/Riwayat.tsx`, `web-app/src/pages/Riwayat.test.tsx`

**Interfaces:**
- Consumes: everything Task 1 produces; `todayWIB` (`lib/dailyLog`); `MhStatusPill`, `fmtDate` (`features/maganghub/LogDetailSheet`); `useSession` (token).

- [ ] **Step 1: Write the failing tests** (fetch stubbed by URL):
  - Renders heading "November 2026", a grid labelled "Kalender November 2026", day buttons whose accessible name reads e.g. "3 November: Hadir, log MagangHub terkirim"; legend shows all labels incl. "✓ Log MagangHub terkirim"; counts show "Hadir 1 dari 12 hari kerja".
  - Clicking day 3 shows its session (shift, masuk/pulang times, status) and the log's three texts; a day without log shows "Belum ada log".
  - ‹ loads `month=2026-10` and the heading becomes "Oktober 2026"; › disabled on the current month; "Bulan ini" returns.
  - Stale answer: ‹ then › quickly, the October answer arriving last does not replace November.
  - No Shelia token → notice "Shelia belum login" with link to "/", logs still marked; no MagangHub token → "MagangHub belum terhubung", colours still shown.
- [ ] **Step 2: Run** `npx vitest run src/pages/Riwayat.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `pages/Riwayat.tsx`: one `rounded-xl border bg-card p-4` card; header row (title, ‹, ›, Bulan ini); calendar (7-column grid, Monday first, blank cells before day 1, square buttons tinted by tone, ✓ top-right, today ring); legend; side counts (`lg:flex-row`, stacked below `lg`); details for the selected day (default today, or day 1 of a past month).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Riwayat page with the admin-panel month calendar`

### Task 3: One route, one sidebar item, old pages and saved history removed

**Files:**
- Modify: `web-app/src/App.tsx`, `web-app/src/components/AppShell.tsx`, `web-app/src/components/AppShell.test.tsx`, `web-app/src/features/shelia/useToday.ts`, `web-app/src/features/shelia/SheliaCard.tsx`
- Delete: `pages/RiwayatShelia.tsx(+test)`, `pages/RiwayatMagangHub.tsx(+test)`, `lib/sheliaHistory.ts(+test)`

- [ ] **Step 1: Write the failing test** in `AppShell.test.tsx`: sidebar has one link "Riwayat" to `/riwayat`; `/riwayat-shelia` and `/riwayat-maganghub` render the Riwayat page.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement:** route `/riwayat` → `Riwayat`, the two old paths `<Navigate to="/riwayat" replace />`; sidebar Riwayat section with one item (crumb "Riwayat"); remove `recordToday`/`rememberShift` calls and the module. `clearSession(true)` keeps removing the old `shelia.history` key (erases old saved data).
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run && npm run build` — Expected: all pass, build ok.
- [ ] **Step 5: Commit** `feat: one Riwayat page; drop the browser-saved Shelia history`, then `./deploy.sh`.
