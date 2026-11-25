# Ubah Absen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Superadmin-only page in Phoenix to find any employee's attendance for a day and change its check-in time and status.

**Architecture:** Phoenix keeps `role_name` from the Shelia login. A small client module wraps `POST /admin/attendances` and `PATCH /v2/attendance/admin/{id}/check-in` through the existing `sheliaApi`. One page with a native dialog form, gated in the sidebar and the route.

**Tech Stack:** React 19, Vite, TypeScript, Vitest + RTL, shadcn components already in `web-app/src/components/ui`.

**Spec:** `docs/2026-11-25-ubah-absen-design.md`

## Global Constraints

- Work on branch `ubah-absen` from `main`; never push or merge without the user asking.
- Superadmin means `employee.role_name === 'Superadmin'` exactly.
- PATCH body: `{ check_in_time: 'YYYY-MM-DD HH:MM', status }`, time in Asia/Jakarta; status one of `checked_in`, `late`, `completed`, `completedlate`.
- List body: `{ start_date: date, end_date: date, per_page: 100, search? }` (search omitted when blank); rows at `data.data`.
- `check_in_record.check_in_time` / `check_out_record.check_out_time` arrive as ISO UTC (`2026-11-17T17:30:00.000000Z`); `attendance_date` arrives as plain WIB `2026-11-18 00:00:00`. Everything shown is WIB.
- Errors shown with the existing `errorText(err)` from `lib/shelia.ts`.
- No new dependencies. Copy in Indonesian, matching the app.
- Tests: `cd web-app && npx vitest run` (all green; 239 before this plan).

## Review Focus

1. A check-in just after midnight WIB (UTC still the previous day) must show and prefill the WIB date, not the UTC one — pinned in Task 2.
2. A row with no check-in record shows `–` and the dialog prefills the work date at 08:00 — pinned in Task 3.
3. A non-Superadmin opening `/ubah-absen` by URL lands on `/` and never sees the nav item — pinned in Task 3.
4. A refused save (e.g. ERR-HR-043) keeps the dialog open and shows the code — pinned in Task 3.
5. Typing fast in search: an older response arriving last must not replace the newer list — guard in Task 3 (ignore responses whose request is not the latest).

---

### Task 1: Keep the role from login

**Files:**
- Modify: `web-app/src/lib/shelia.ts` (`Employee`, new `isSuperadmin`)
- Modify: `web-app/src/features/session/SessionProvider.tsx` (login keeps `role_name`)
- Test: `web-app/src/features/session/LoginPage.test.tsx`, `web-app/src/lib/shelia.test.ts`

**Interfaces:**
- Produces: `Employee.role_name?: string`; `isSuperadmin(e: Employee | null): boolean` exported from `lib/shelia.ts`.

- [ ] **Step 1: Write failing tests**
  - `shelia.test.ts` › `isSuperadmin is true only for role_name Superadmin`: `isSuperadmin({role_name:'Superadmin'})` true; `{role_name:'HR officer'}`, `{}`, `null` false.
  - `LoginPage.test.tsx` › `login keeps role_name`: login response `employee: {full_name:'Andi', nik:'1', branch_name:'X', role_name:'Superadmin'}` → `getEmployee()?.role_name === 'Superadmin'` (follow the file's existing login test setup).
- [ ] **Step 2: Run** `npx vitest run src/lib/shelia.test.ts src/features/session` — Expected: both new tests FAIL.
- [ ] **Step 3: Implement** — add `role_name` to `Employee` and to the `emp` object built in `login`; add `isSuperadmin`.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(session): keep the Shelia role from login`

### Task 2: Admin attendance client

**Files:**
- Create: `web-app/src/lib/adminAttendance.ts`
- Test: `web-app/src/lib/adminAttendance.test.ts`

**Interfaces:**
- Consumes: `sheliaApi` from `lib/shelia.ts`.
- Produces:
  - `CHECK_IN_STATUSES = ['checked_in','late','completed','completedlate'] as const`; `type CheckInStatus = typeof CHECK_IN_STATUSES[number]`
  - `interface AdminRow { id: string; date: string /* YYYY-MM-DD */; name: string; checkIn: string | null /* 'YYYY-MM-DD HH:MM' WIB */; checkOut: string | null; status: string }`
  - `toWib(s: string | null | undefined): string | null` — ISO with `Z`/offset → WIB `'YYYY-MM-DD HH:MM'`; plain `'YYYY-MM-DD HH:MM[:SS]'` → first 16 chars; empty → null.
  - `listAttendance(date: string, search: string): Promise<AdminRow[]>` — throws `ApiError` as `sheliaApi` does; action `'Daftar absen (admin)'`.
  - `editCheckIn(id: string, at: string, status: CheckInStatus): Promise<void>` — `PATCH /v2/attendance/admin/${encodeURIComponent(id)}/check-in`; action `'Ubah check-in (admin)'`.

- [ ] **Step 1: Write failing tests** (stub `fetch` like `Riwayat.test.tsx`)
  - `toWib converts UTC to WIB across midnight`: `toWib('2026-11-17T17:30:00.000000Z') === '2026-11-18 00:30'`; `toWib('2026-11-18 00:00:00') === '2026-11-18 00:00'`; `toWib(null) === null`.
  - `listAttendance posts the day and maps rows`: called with `('2026-11-18','budi')` → fetch URL ends `/api/admin/attendances`, method POST, body `{start_date:'2026-11-18', end_date:'2026-11-18', per_page:100, search:'budi'}`; response `{data:{data:[{id:'u1', attendance_date:'2026-11-18 00:00:00', status:'late', employee:{full_name:'Budi'}, check_in_record:{check_in_time:'2026-11-18T01:40:00.000000Z'}, check_out_record:null}]}}` → `[{id:'u1', date:'2026-11-18', name:'Budi', checkIn:'2026-11-18 08:40', checkOut:null, status:'late'}]`.
  - `listAttendance omits a blank search`: `('2026-11-18','  ')` → body has no `search` key.
  - `editCheckIn sends WIB time and status`: `('u1','2026-11-18 07:55','checked_in')` → PATCH `/api/v2/attendance/admin/u1/check-in`, body `{check_in_time:'2026-11-18 07:55', status:'checked_in'}`.
  - `editCheckIn throws the Shelia error`: response 403 `{status:'error', message:'Tidak boleh', error_code:'ERR-HR-043'}` → rejects with `ApiError` whose `code === 'ERR-HR-043'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/adminAttendance.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** — `toWib` uses `Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Jakarta', …})` (gives `YYYY-MM-DD HH:MM`).
- [ ] **Step 4: Run** same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): attendance list and check-in edit client`

### Task 3: Ubah Absen page, route and nav

**Files:**
- Create: `web-app/src/pages/UbahAbsen.tsx`
- Modify: `web-app/src/App.tsx` (route `/ubah-absen`), `web-app/src/components/AppShell.tsx` (item `{ to: '/ubah-absen', label: 'Ubah Absen', crumb: 'Ubah Absen' }` in Alat, only when `isSuperadmin(employee)`)
- Test: `web-app/src/pages/UbahAbsen.test.tsx`, `web-app/src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: Task 1 `isSuperadmin`, `useSession().employee`; Task 2 everything; `todayWIB()` from `lib/dailyLog.ts`; `errorText`, `ApiError` from `lib/shelia.ts`.

Page behavior: non-Superadmin → `<Navigate to="/" replace />`. Date `<input type="date">` (default `todayWIB()`), name `<Input>` (label "Cari nama"), reload 300 ms after the last change; only the latest request's result is applied. Table: Nama, Masuk, Pulang, Status, and an **Ubah** button per row (`aria-label="Ubah absen <name>"`); times shown as `HH:MM`, missing as `–`; empty → "Tidak ada absen di tanggal ini."; list error → `role="alert"` with `errorText`. Dialog (existing `ui/dialog`): title "Ubah check-in · <name>", `<input type="datetime-local">` labelled "Jam masuk" prefilled `checkIn` (or `<date> 08:00`), native `<select>` labelled "Status" with the four values (prefilled with the row's status if it is one of them, else `checked_in`), **Simpan** (disabled while saving). Save → `editCheckIn(id, value.replace('T',' '), status)` → close, `toast.success('Jam check-in diubah')`, reload list. Error → stays open, `role="alert"` shows `errorText`.

- [ ] **Step 1: Write failing tests** (`UbahAbsen.test.tsx`, render inside `MemoryRouter` + `SessionProvider`, `saveSession('tok', {full_name:'Andi', role_name:'Superadmin'})`, system time `2026-11-18T03:00:00Z`)
  - `lists today's attendance`: first list body has `start_date:'2026-11-18'`; row "Budi" shows `08:40` and `late`.
  - `a row without check-in shows a dash and prefills 08:00`: row with `check_in_record:null` shows `–`; clicking its Ubah → "Jam masuk" value `2026-11-18T08:00`.
  - `saving sends the edit and reloads`: open Budi, set Jam masuk `2026-11-18T07:55`, Status `checked_in`, Simpan → PATCH body `{check_in_time:'2026-11-18 07:55', status:'checked_in'}`, dialog closes, list fetched again.
  - `a refused save keeps the dialog open`: PATCH answers 403 `ERR-HR-043` → dialog still open, alert text contains `ERR-HR-043`.
  - `a non-Superadmin is sent home`: `saveSession('tok', {full_name:'Budi'})`, route `/ubah-absen` with a `/` route rendering "HOME" → "HOME" shown, no list request made.
  - `AppShell.test.tsx` › `shows Ubah Absen only to a Superadmin`: link "Ubah Absen" present with `role_name:'Superadmin'`, absent without.
- [ ] **Step 2: Run** `npx vitest run src/pages/UbahAbsen.test.tsx src/components/AppShell.test.tsx` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the page, route and nav filter.
- [ ] **Step 4: Run** same — Expected: PASS. Then full suite `npx vitest run` and `npx tsc -b` — Expected: all green, no type errors.
- [ ] **Step 5: Commit** `feat(admin): Ubah Absen page for Superadmin`
