# Test Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the test site's main page with a four-page React + shadcn app in the admin panel's Metronic look (Absen, Riwayat Shelia, Riwayat MagangHub, Log API), keeping the classic page at `/classic/`.

**Architecture:** A static Vite app in `web-app/`, built on the Mac and served by the existing nginx container at `/` with an SPA fallback. It talks to the same same-origin proxies as today (`/api/`, `/monev-api/v1/`, `/maganghub-api/v1/…`). Every call goes through one logging fetch wrapper that feeds the in-memory Log API page. Pure logic lives in `src/lib/*.ts` (unit-tested). Pages and cards live in `src/pages` and `src/features`.

**Tech Stack:** Vite 7, React 19, TypeScript 5.8, Tailwind 3.4 + tailwindcss-animate, shadcn new-york (Radix), lucide-react, sonner, react-router-dom 7, @fontsource-variable/inter, Vitest 5 + @testing-library/react + jsdom.

**Spec:** `docs/2026-11-17-redesign-design.md` (approved mockup: `docs/2026-11-17-redesign-mockup.html`)

## Global Constraints

- Versions and config copy the admin panel at `~/Documents/ubuntu-vps/admin-panel` (`package.json`, `components.json`, `tailwind.config.ts`, `src/index.css`, `src/lib/utils.ts`, `src/lib/theme.ts`). Copy files, never import across repos. Path alias `@/` → `src/`.
- One deliberate token change from the admin panel: light-theme `--primary: 212 100% 42%`, so white text on primary meets 4.5:1. Dark theme stays as copied.
- All UI copy is Indonesian, with no em or en dashes in copy. The words "mock", "server uji", "test server" and "Monev" never appear in the UI.
- Controls are 36px high (`h-9`) and rail items 40px (`h-10`). Status is shown as label + icon + tint (`bg-<tone>/10 text-<tone>-ink`), never color alone.
- Storage keys stay unchanged: `absen.token`, `absen.employee`, `maganghub.token`. New key: `shelia.history`.
- Shelia: `CONFIG.LAT = -7.308430344545027`, `CONFIG.LNG = 112.785199930883`, API base `/api`, `platform=web`, photo max 10 MB (jpeg/png). Face token is valid while `expiresAt - now > 15000` ms. Fallback expiries are 9 min (face token) and 25 min (bypass). Reason length 10 to 255 when `required_note`.
- RELOAD_CODES: `ERR-HR-019, ERR-HR-074, ERR-HR-075, ERR-HR-020, ERR-HR-041, ERR-HR-076, ERR-HR-027`. `ERR-HR-028` clears the face token.
- MagangHub daily log: status `PRESENT` (shown "Hadir"), location `"Surabaya"`. Fields `activity_log`, `lesson_learned` and `obstacles` each need ≥ **100** characters after trim. Date defaults to today in WIB (UTC+7).
- Real MagangHub is read-only: only `GET /maganghub-api/v1/daily-logs?page=N`. Never send a write to it. Never touch or ask for the Kemnaker password.
- Secrets are never shown in the log. Redacted keys (any depth, any case): `password, token, access_token, face_token, bypass_token, face_bypass_token`, plus the `Authorization` header. The log holds at most 200 entries, in memory only.
- VPS: only `/home/Documents/shelia-test` may be touched (never `app/`). No sudo, no prune, no stopping other containers. Never force-push.

## Review Focus

1. **Token hand-off on a fresh load** (`/#mh=…` opened by the bookmark): the token is stored and the fragment stripped before React or the router renders, so the token never stays in the address bar or reaches a route. *Test in Task 6.*
2. **Shelia 401 mid-session** (expired token on any page): the session clears and the login screen shows with "Sesi berakhir. Silakan login lagi." There is no blank page and no endless retry. *Test in Task 4.*
3. **Text that is 100 characters only with spaces** (e.g. 99 letters plus trailing spaces): counted after trim, so it still blocks submit in the UI and gets a 422 from the mock. *Tests in Tasks 1 and 6.*
4. **MagangHub non-JSON or odd response** (HTML error page, `data` not an array, missing `total`): the page shows an error or empty state and never crashes. Pagination falls back to ‹ › without a total. *Test in Task 8.*
5. **Deep link refresh** (`/riwayat-maganghub` reloaded): nginx serves the app, not 404. The classic page still loads at `/classic/` with its injected columns. *Check in Task 10.*

---

### Task 1: Mock enforces 100 characters

**Files:**
- Modify: `monev-mock/server.js:84` (inside `createEntry`)
- Modify: `monev-mock/server.test.js` (fixture at line 13, new test)
- Modify: `web/monev.html:44-46` (add `minlength="100"` to the three textareas)

**Interfaces:** Produces the 422 body `{ message: "Data tidak valid", errors: { activity_log?: string, lesson_learned?: string, obstacles?: string } }` with the message `"<field> minimal 100 karakter"`.

- [ ] **Step 1: Write the failing test.** In `server.test.js`, change the base fixture texts to `"a".repeat(100)`, `"b".repeat(100)` and `"c".repeat(100)`. Add:
```js
test("PRESENT text fields need 100 chars after trim", async () => {
  const r = await post(body({ date: "2026-11-18", lesson_learned: "x".repeat(99) + "   " }));
  assert.strictEqual(r.status, 422);
  assert.match((await r.json()).errors.lesson_learned, /minimal 100 karakter/);
});
```
- [ ] **Step 2: Run** `node --test monev-mock/`. Expected: the new test FAILS (status 201).
- [ ] **Step 3: Implement.** Under PRESENT: empty → `"<f> wajib diisi"` as today; otherwise `b[f].trim().length < 100` → `"<f> minimal 100 karakter"`. Add `minlength="100"` to the three textareas in `web/monev.html`.
- [ ] **Step 4: Run** `node --test monev-mock/ web/`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(mock): require 100 characters per daily-log field`.

### Task 2: App scaffold, theme and shell

**Files:**
- Create: `web-app/` containing `package.json`, `vite.config.ts`, `tsconfig*.json`, `tailwind.config.ts`, `postcss.config.js`, `components.json` and `index.html`; `src/main.tsx`, `src/App.tsx` and `src/index.css`; `src/lib/utils.ts` and `src/lib/theme.ts`; the needed `src/components/ui/*` files; `src/components/AppShell.tsx`, `src/components/ThemeToggle.tsx` and `src/test/setup.ts`.
- Create: `src/pages/{Absen,RiwayatShelia,RiwayatMagangHub,LogApi}.tsx` as placeholders with `<h1>` only.
- Modify: `.gitignore` (add `web-app/node_modules`, `web-app/dist`).
- Test: `src/components/AppShell.test.tsx`

**Interfaces:**
- **Produces routes:** `/` → Absen, `/riwayat-shelia`, `/riwayat-maganghub`, `/log-api`. Unknown paths redirect to `/`.
- **Produces `AppShell`:** `({ children }: { children: ReactNode })`. Holds the rail sections, the header with breadcrumb, date chip, `ThemeToggle` and a user menu slot, and `<Toaster />` from sonner.
- **Produces `src/components/ui/*`:** button, card, badge, input, textarea, label, select, table, tabs, sheet, dialog, dropdown-menu, tooltip, skeleton, separator and sonner, copied from admin `src/components/ui-kit`, with imports rewritten to `@/components/ui/…`.

- [ ] **Step 1: Scaffold.** Copy the deps and devDeps from the admin `package.json`, keeping only what these components and the test setup use. Copy the configs, `index.css` (with the `--primary` change from Global Constraints) and `theme.ts`. In `main.tsx`, import `@fontsource-variable/inter`.
- [ ] **Step 2: Write the failing test** `AppShell.test.tsx`. Render the app at `/log-api` in a `MemoryRouter`. Assert:
  - links named "Absen", "Riwayat Shelia", "Riwayat MagangHub" and "Log API" exist;
  - the "Log API" link has `aria-current="page"`;
  - the heading "Log API" is visible.
- [ ] **Step 3: Run** `cd web-app && npx vitest run`. Expected: FAIL.
- [ ] **Step 4: Implement `AppShell` from the mockup.**
  - **Rail:** dark `bg-sidebar` rail, 240px wide at `lg`. Below `lg` it turns into a `Sheet` opened by a menu button in the header.
  - **Rail sections:** Absensi (Absen), Riwayat (Riwayat Shelia, Riwayat MagangHub), Alat (Log API).
  - **Rail items:** `NavLink`, 40px high. Active state is `bg-sidebar-accent text-white` with a blue dot, and no side stripe.
  - **Breadcrumb:** "Absensi / Absen", "Riwayat / Shelia", "Riwayat / MagangHub", "Alat / Log API".
  - **Date chip:** for example "Selasa, 17 Nov 2026", via `Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Jakarta', weekday:'long', day:'numeric', month:'short', year:'numeric'})`.
- [ ] **Step 5: Run** `npx vitest run && npm run build`. Expected: PASS, and the build writes `web-app/dist/index.html`.
- [ ] **Step 6: Commit** `feat(web-app): scaffold shell with admin-panel tokens`.

### Task 3: Logged fetch, redaction, Log API model

**Files:**
- Create: `src/lib/redact.ts`, `src/lib/apiLog.ts`
- Test: `src/lib/redact.test.ts`, `src/lib/apiLog.test.ts`

**Interfaces (produces):**
```ts
// redact.ts: port of web/api-log.js helpers; HIDDEN replaces "***"
export const HIDDEN = "[disembunyikan]";
export function redactJson(v: unknown): unknown;
export function redactHeaders(h: HeadersInit | undefined): Record<string, string>;   // Authorization -> "Bearer [disembunyikan]"
export function describeBody(body: BodyInit | null | undefined): unknown;           // FormData files -> "[file name, N KB]"
export function redactPath(url: string): string;
// apiLog.ts
export type Source = "shelia" | "maganghub";
export interface LogEntry { id: number; action: string; source: Source; method: string; path: string;
  title: string; status: number | null; ms: number; at: number;
  reqHeaders: Record<string,string>; reqBody: unknown; resHeaders: Record<string,string>; resBody: unknown; }
export function loggedFetch(url: string, init: RequestInit & { action: string }): Promise<Response>;
export function useApiLog(): LogEntry[];           // useSyncExternalStore, newest first
export function clearLog(): void;
export function groupEntries(e: LogEntry[]): { key: string; action: string; at: number; entries: LogEntry[] }[];
export function titleFor(method: string, path: string): string;
export function explain(e: LogEntry): { bad: boolean; title: string; text: string };
```

- [ ] **Step 1: Write the failing tests.**
  - **`redact.test.ts`:** port the cases from `web/api-log.test.js` and `web/api-log-wrapper.test.js`, with `"***"` replaced by `HIDDEN`. Add a nested `{ meta: { Bypass_Token: "x" } }` → `HIDDEN`.
  - **`apiLog.test.ts`:**
    - `loggedFetch` with a stubbed `fetch` returning JSON `{token:"t"}` records `resBody.token === HIDDEN`, `status 200`, `source "shelia"` for `/api/…`, `source "maganghub"` for `/monev-api/…` and `/maganghub-api/…`, and the caller still reads the original body.
    - A network error records `status: null`.
    - 201 inserts keep only the newest 200 entries.
    - `groupEntries` merges consecutive same-`action` entries and splits when the action changes.
    - `titleFor` maps the paths below, and an unknown path returns the path itself.
    - `explain` on a 422 with `{message:"X", error_code:"ERR-HR-028"}` → `{bad:true, title:"Gagal (422)", text}` where `text` contains "X".
- [ ] **Step 2: Run** `npx vitest run src/lib`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`loggedFetch`** times the call, clones the response for the log and pushes to a module store.
  - **Title map:**

    | Method and path | Title |
    |---|---|
    | `POST /api/auth/login` | Login |
    | `POST /api/auth/logout` | Keluar |
    | `POST /api/attendance-integration/user/today` | Cek status hari ini |
    | `GET /api/v2/attendance/shifts/available` | Ambil daftar shift |
    | `POST /api/v2/attendance/face/verify` | Verifikasi wajah |
    | `POST /api/v2/attendance/check-in` | Kirim absen masuk |
    | `POST /api/v2/attendance/check-out` | Kirim absen pulang |
    | `POST /monev-api/v1/attendances/with-daily-log` | Kirim log harian |
    | `GET /monev-api/v1/daily-logs` | Cek log hari ini |
    | `GET /maganghub-api/v1/daily-logs` | Ambil log MagangHub |

    Paths are matched without the query string.
  - **`explain`:** success → `{bad:false, title:"Berhasil", text:message||"Permintaan berhasil."}`. `status null` → "Tidak bisa terhubung ke server." 401/403 → "Sesi atau token tidak berlaku. Masuk lagi." Otherwise use the response `message`, plus `(error_code)`.
- [ ] **Step 4: Run** `npx vitest run src/lib`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-app): logged fetch with redaction and log model`.

### Task 4: Shelia client, session and login

**Files:**
- Create: `src/lib/shelia.ts`, `src/features/session/{SessionProvider.tsx,LoginPage.tsx}`
- Modify: `src/App.tsx` (no token → `LoginPage`, otherwise the shell); `AppShell` user menu (name, NIK, Keluar)
- Test: `src/lib/shelia.test.ts`, `src/features/session/LoginPage.test.tsx`

**Interfaces (produces):**
```ts
export const CONFIG: { API_BASE: "/api"; LAT: number; LNG: number };
export class ApiError extends Error { status?: number; code?: string; meta?: any; errors?: any; retryAfter?: string | null }
export function sheliaApi<T = any>(path: string, o: { method?: string; json?: unknown; form?: FormData; auth?: boolean; action: string }): Promise<T>;
export function errorText(err: ApiError): string;                 // port of app.js errorText
export function getToken(): string | null; export function getEmployee(): { full_name?: string; nik?: string; branch_name?: string } | null;
export function saveSession(token: string, emp: object): void; export function clearSession(): void;
export function onUnauthorized(cb: () => void): () => void;       // fired on 401 with auth
// SessionProvider exposes useSession(): { token, employee, login(nik, pw), logout(), expiredMessage }
```

- [ ] **Step 1: Write the failing tests.**
  - **`sheliaApi`:**
    - It sends `Authorization: Bearer <token>`, `Accept-Language: id` and the JSON body.
    - On `{status:"error", message:"M", error_code:"E"}` it throws an `ApiError` with code `E`.
    - A fetch rejection gives `code:"NETWORK"` with "Tidak bisa terhubung ke server. Periksa koneksi internet."
    - A 401 with auth calls `clearSession` and fires `onUnauthorized` (Review Focus 2).
  - **`errorText`:** the same cases as app.js (field errors joined, attempts remaining, retryAfter).
  - **`LoginPage`:**
    - Empty submit shows "NIK dan password wajib diisi."
    - Successful login (stub) calls `saveSession` with `{full_name,nik,branch_name}`.
    - The 401 listener shows "Sesi berakhir. Silakan login lagi."
- [ ] **Step 2: Run** `npx vitest run`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **API calls:** port `api()`, `errorText` and the storage helpers from `app.js:95-183`, using `loggedFetch` with `action`.
  - **Login card:** a centered `Card` with the NIK field (label "NIK", `autoComplete="username"`), password with a show/hide toggle, an inline `Alert` for errors, and a busy button "Memproses…".
  - **Actions:** "Masuk ke akun" for login and logout (logout clears the session even when the request fails).
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-app): Shelia session and login`.

### Task 5: Shelia check-in card and history recording

**Files:**
- Create: `src/lib/attendance.ts`, `src/lib/sheliaHistory.ts`, `src/features/shelia/{useToday.ts,SheliaCard.tsx,CameraCapture.tsx,Sessions.tsx}`
- Modify: `src/pages/Absen.tsx` (left column: `SheliaCard`)
- Test: `src/lib/attendance.test.ts`, `src/lib/sheliaHistory.test.ts`

**Interfaces (produces):**
```ts
// attendance.ts (pure)
export const RELOAD_CODES: Set<string>;
export interface TimedToken { token: string; expiresAt: number }
export function tokenUsable(t: TimedToken | null, now: number): boolean;           // > 15_000 ms left
export function currentStep(a: { needShift: boolean; shiftId: string; faceOn: boolean; hasPhoto: boolean; faceToken: TimedToken | null; now: number }): 1 | 2 | 3;
export function buildAttendForm(a: { isIn: boolean; shiftId?: string; attendanceId?: string; reason?: string;
  faceToken?: string; bypassToken?: string; photo?: Blob; photoName?: string }): FormData;
export function shiftLabel(s: any): string; export function fmtTime(v: unknown, workDate?: string): string;
export function reviewReasons(v: unknown): string; export function successText(isIn: boolean, res: any): string;
// sheliaHistory.ts
export interface HistoryRow { date: string; shift: string; checkIn: string; checkOut: string; status: "hadir" | "terlambat" | "belum" | "berjalan" }
export function recordToday(today: any): void;     // upsert by work_date into localStorage["shelia.history"], max 400 days
export function readHistory(): HistoryRow[];       // newest first; tolerates corrupt storage (returns [])
// useToday(): { today, shifts, loading, reload(), error }
```

- [ ] **Step 1: Write the failing tests.**
  - **`buildAttendForm`:**
    - Check-in with a face token gives fields `lat`, `lng`, `platform=web`, `shift_id` and `face_token`, and no `file_photo`.
    - The bypass case has `face_bypass_token` plus `file_photo`.
    - Check-out includes `attendance_id`.
    - `reason` is present only when given.
  - **`currentStep`:** shift not picked → 1; picked with no photo or face token → 2; photo ready or token usable → 3; no shift needed and face off → 3.
  - **`tokenUsable`:** 15 001 ms left → true, 15 000 → false.
  - **`recordToday` and `readHistory`:**
    - Two calls for the same date keep one row.
    - A late session maps to "terlambat".
    - A corrupt JSON in storage → `[]`.
- [ ] **Step 2: Run** `npx vitest run src/lib`. Expected: FAIL.
- [ ] **Step 3: Implement the pure modules** (port from `app.js` 207-235, 386-400, 623-710).
- [ ] **Step 4: Run** `npx vitest run src/lib`. Expected: PASS.
- [ ] **Step 5: Build the card** following `app.js` `loadToday`, `render`, `renderAttendForm` and `onAttend`.
  - **Header and stepper:** the header shows "Shelia", a status badge and a "Muat ulang" icon button. The stepper reads "1 · Shift", "2 · Foto wajah", "3 · Kirim" and is driven by `currentStep`, with done steps in success tone and the active step in primary.
  - **Shift:** a `Select` of shifts, auto-selected when there is only one.
  - **Camera:** `CameraCapture` opens getUserMedia (`facingMode:"user"`, 1280×960 ideal) or an "Unggah foto" file input (jpeg/png, ≤ 10 MB), and stops tracks on unmount.
  - **Reason:** a reason `Textarea` with recent-reason chips when `required_note`.
  - **Alerts:** face not enrolled (blocks), outside area (blocks), bypass note, missed check-out.
  - **Submit:** the button "Check-in" or "Check-out", with " (HR review)" added on bypass. It is busy-labelled with "Memverifikasi wajah…" and "Mengirim check-in…" or "Mengirim check-out…".
  - **Feedback:** success → sonner toast with `successText`, then reload. Errors → inline `Alert` with `errorText`, and reload on RELOAD_CODES.
  - **Sessions:** the `Sessions` list appears under the card.
  - **History:** call `recordToday` after every successful `user/today`.
  - **Actions:** `"Absen masuk"`, `"Absen pulang"`, `"Muat status hari ini"`.
- [ ] **Step 6: Run** `npx vitest run && npm run build`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(web-app): Shelia check-in card`.

### Task 6: MagangHub token and daily-log card

**Files:**
- Create: `src/lib/maganghub.ts`, `src/lib/dailyLog.ts`, `src/features/maganghub/{MagangHubCard.tsx,TokenDialog.tsx,useMhToken.ts}`
- Modify: `src/main.tsx` (call `intakeTokenFromLocation()` before `createRoot`); `src/pages/Absen.tsx` (right column)
- Test: `src/lib/maganghub.test.ts`, `src/lib/dailyLog.test.ts`, `src/features/maganghub/MagangHubCard.test.tsx`

**Interfaces (produces):**
```ts
// maganghub.ts
export const MH_KEY = "maganghub.token";
export function takeTokenFromHash(hash: string): string | null;      // port
export function bookmarkletHref(origin: string): string;             // port, keeps the %23 escape
export function intakeTokenFromLocation(): void;                     // store + history.replaceState(null,"",pathname+search)
export function tokenExpiry(token: string): Date | null;             // base64url JWT payload .exp, null if not a JWT
export type MhStatus = "none" | "ok" | "expired";
export function fetchDailyLogs(page: number): Promise<{ status: MhStatus; rows: MhLog[]; total: number | null; error?: string }>;
export interface MhLog { date: string; clock_in?: string; status?: string; activity_log?: string; lesson_learned?: string; obstacles?: string }
// dailyLog.ts
export const MIN_CHARS = 100;
export function fieldState(text: string): { count: number; ok: boolean; missing: number };   // trimmed length
export function remainingFields(v: { activity_log: string; lesson_learned: string; obstacles: string }): number;
export function todayWIB(now?: Date): string;                        // YYYY-MM-DD
export function submitDailyLog(v: {...; date: string}): Promise<void>;   // POST /monev-api/v1/attendances/with-daily-log, status PRESENT, location "Surabaya"
export function fetchMyToday(date: string): Promise<{ sentAt: string } | null>;            // GET /monev-api/v1/daily-logs?page=1
```

- [ ] **Step 1: Write the failing tests.**
  - **`maganghub.test.ts`:**
    - Port the `web/maganghub.test.js` cases.
    - `intakeTokenFromLocation` with `location.hash="#mh=abc%2B1"` stores `"abc+1"` and leaves `location.hash === ""` (Review Focus 1).
    - `tokenExpiry` on a JWT whose payload is `{exp: 1795000000}` → `new Date(1795000000*1000)`, and on `"notajwt"` → null.
    - `fetchDailyLogs`:
      - 401 → `status:"expired"`;
      - HTML body → `rows: []` with an `error`;
      - `data` not an array → `rows: []`;
      - no token → `status:"none"`, with no fetch made.
  - **`dailyLog.test.ts`:**
    - `fieldState("x".repeat(99)+"  ")` → `{count:99, ok:false, missing:1}` (Review Focus 3).
    - `fieldState("x".repeat(100)).ok === true`.
    - `remainingFields` counts the not-ok fields.
    - `todayWIB(new Date("2026-11-17T18:00:00Z")) === "2026-11-18"`.
  - **`MagangHubCard.test.tsx`:**
    - With fields under 100, "Kirim log" is disabled and "Lengkapi 3 isian lagi" is shown.
    - After typing 100 characters in all three, it is enabled.
    - When `fetchMyToday` returns `{sentAt:"08:01"}`, it shows "Terkirim 08:01" and the textareas are disabled.
- [ ] **Step 2: Run** `npx vitest run`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Card header:** "MagangHub", a connection badge (Terhubung / Belum terhubung / Kedaluwarsa), the text "berlaku sampai HH:mm" from `tokenExpiry`, and a "Perbarui token" button. On a 401/403 from `fetchDailyLogs`, the badge flips to Kedaluwarsa.
  - **`TokenDialog`:** a drag-to-bookmark link "→ Shelia" (`href=bookmarkletHref(location.origin)`; when clicked here, `preventDefault` and show a toast "Seret tombol ini ke bookmark bar") and three numbered steps:
    1. "Seret tombol ke bookmark bar"
    2. "Buka MagangHub dan login"
    3. "Klik bookmark → Shelia"

    It also has a "Putuskan" (disconnect) button that removes the token.
  - **Form:** Tanggal (date input, default `todayWIB()`), Status read-only "Hadir", Lokasi read-only "Surabaya", then Aktivitas, Pembelajaran and Kendala as `Textarea`s (`rows=3`). Each textarea has a counter `aria-live="polite"` reading "x / 100 karakter · kurang n" in warning ink or "✓ n karakter" in success ink. Next to the disabled primary "Kirim log" is the text "Lengkapi n isian lagi".
  - **Feedback:** a 422 from the mock maps `errors` to the matching field.
  - **Actions:** `"Kirim log harian"`, `"Cek log hari ini"`.
  - **Absen page header:** "Absen hari ini" plus one status line built from both cards, for example "Shelia: belum masuk. MagangHub: belum diisi." Shelia's part uses `STATUS_LABEL` from app.js in lowercase. MagangHub's part is "belum diisi" or "terkirim HH:mm". Below `lg` the two cards stack, Shelia first.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-app): MagangHub token hand-off and daily-log form`.

### Task 7: Pagination and Riwayat Shelia

**Files:**
- Create: `src/components/ListPagination.tsx` (port of admin `ListPagination` + `PageJump` + `pageWindow` from `src/components/patterns/data-grid/DataGrid.tsx`, with inline copy "dari", "Ke halaman", "Halaman sebelumnya", "Halaman berikutnya", "Baris per halaman")
- Modify: `src/pages/RiwayatShelia.tsx`
- Test: `src/components/ListPagination.test.tsx`, `src/pages/RiwayatShelia.test.tsx`

**Interfaces (produces):** `ListPagination({ page, perPage, total, onPageChange, onPerPageChange?, perPageOptions = [10, 25, 50], ready = true })`. Omitting `onPerPageChange` hides the select. `total: null` is allowed and shows only ‹ ›, enabled by `hasNext?: boolean`.

- [ ] **Step 1: Write the failing tests.**
  - **`ListPagination`:**
    - `page 1, perPage 10, total 34` shows "1-10 dari 34" and buttons 1 to 4 with page 1 `aria-current="page"`.
    - Clicking › calls `onPageChange(2)`.
    - At 30 pages the "Ke halaman" input appears.
    - `total:null, hasNext:false` disables ›.
  - **`RiwayatShelia`:**
    - Seeded `shelia.history` with 12 rows shows 10 rows and "1-10 dari 12".
    - Search "16 Nov" filters the rows.
    - There is no text starting with "Hari sebelumnya".
- [ ] **Step 2: Run** `npx vitest run`. Expected: FAIL.
- [ ] **Step 3: Implement the table.** Columns: Tanggal (formatted `16 Nov 2026`), Shift, Masuk, Pulang, Status badge (Hadir success, Terlambat warning, Belum masuk muted, Berjalan primary). Add a search `Input` "Cari tanggal atau shift…" and a "Muat ulang" button that re-calls `user/today` with action `"Muat riwayat Shelia"`. The empty state reads "Belum ada riwayat.".
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-app): pagination and Riwayat Shelia`.

### Task 8: Riwayat MagangHub with detail sheet

**Files:**
- Modify: `src/pages/RiwayatMagangHub.tsx`
- Create: `src/features/maganghub/LogDetailSheet.tsx`
- Test: `src/pages/RiwayatMagangHub.test.tsx`

- [ ] **Step 1: Write the failing tests** (stub `fetchDailyLogs`).
  - **Table:** 3 rows show the columns Tanggal, Masuk, Status, Aktivitas, Pembelajaran, Kendala and an action column. There is no dialog on load (`queryByRole("dialog")` is null).
  - **Detail sheet:**
    - Clicking row 1 opens the dialog with all three full texts.
    - "Berikutnya" shows row 2's date.
    - Escape closes the sheet and focus returns to row 1.
  - **Connection states:** `status:"none"` shows "MagangHub belum terhubung" with a button "Hubungkan di halaman Absen" linking to `/`. `error` shows the error text (Review Focus 4).
  - **Page size:** there is no "Baris per halaman" control.
- [ ] **Step 2: Run** `npx vitest run src/pages`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Columns:** use `table-layout: fixed`. The three text columns have equal width and clamp to 2 lines (`line-clamp-2`).
  - **Rows:** each row is focusable (`tabIndex=0`, Enter opens it) and has a "Lihat" ghost button.
  - **Sheet:** a right `Sheet` (closed by default) shows the date, check-in time, status badge and the three labelled full texts, with "‹ Sebelumnya" and "Berikutnya ›" in the footer.
  - **Pagination:** `ListPagination` without `onPerPageChange`. `perPage` is the first page's row count. When `total` is null, use `hasNext = rows.length > 0`.
  - **Header:** a "Muat ulang" button. The action name is `"Muat riwayat MagangHub"`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-app): Riwayat MagangHub with detail sheet`.

### Task 9: Log API page

**Files:**
- Modify: `src/pages/LogApi.tsx`
- Create: `src/features/log/{LogList.tsx,LogDetail.tsx,JsonView.tsx}`
- Test: `src/pages/LogApi.test.tsx`

- [ ] **Step 1: Write the failing tests** (seed the store via `loggedFetch` with stubbed fetch).
  - **Grouping:** entries group under "Absen masuk · HH:mm".
  - **Selection:** selecting the 422 entry shows the summary box with "Gagal (422)" and the message, and the Response tab shows `[disembunyikan]` for `bypass_token`.
  - **Filters:** "Gagal (1)" shows only the failed entry. "MagangHub" hides `/api/` entries.
  - **Clear:** "Bersihkan" empties the list and shows "Belum ada panggilan API di sesi ini.".
- [ ] **Step 2: Run** `npx vitest run src/pages`. Expected: FAIL.
- [ ] **Step 3: Implement it as in the mockup's page 4.**
  - **Header:** "n panggilan di sesi ini · m gagal".
  - **Filters:** a segmented filter Semua / Shelia / MagangHub, a second one Semua status / Gagal (m), and a search box matching path or title.
  - **List rows:** method chip, title, status badge, and mono path · ms. The first entry is selected by default.
  - **Detail:** a summary box (`explain`), four meta tiles (Metode, Status, Durasi, Waktu), and `Tabs` for Request / Response / Header.
  - **`JsonView`:** pretty JSON with key, string and number colors. `HIDDEN` values render as a muted chip. A "Salin" button copies the JSON via `navigator.clipboard`.
  - **Footnote:** "Nilai rahasia tidak pernah ditampilkan. Log hilang saat tab ditutup."
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-app): readable Log API page`.

### Task 10: Serve the app, move classic, deploy

**Files:**
- Modify: `nginx.conf`, `docker-compose.yml`, `README.md` (deploy steps)
- Create: `deploy.sh`

**Interfaces:** the VPS layout gains `/home/Documents/shelia-test/web-app/dist`. The container mount is `./web-app/dist:/srv/spa:ro`.

- [ ] **Step 1: Edit `nginx.conf`.**
  - **CSP map:** keep the api sandbox line, add `~^/classic/ ""`, and make the default value the app CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`.
  - **Classic page:** move the two classic `location = /` and `= /index.html` blocks to `location = /classic/` (`root /srv/app; try_files /index.html =404;` with the same sub_filters). Add `location = /classic/style.css { alias /srv/app/style.css; }` and `location = /classic/app.js { alias /srv/app/app.js; ` plus the existing sub_filters `}`. Add `location = /classic { return 301 /classic/; }`. Delete the old `= /style.css` and `= /app.js`.
  - **New app:** replace `location / { return 404; }` with `location / { root /srv/spa; try_files $uri /index.html; }`.
- [ ] **Step 2: Edit `docker-compose.yml`:** add the volume `./web-app/dist:/srv/spa:ro` to `web`.
- [ ] **Step 3: Write `deploy.sh`.** It runs `cd web-app && npm ci && npm run build`, then rsyncs `web-app/dist/`, `nginx.conf`, `docker-compose.yml`, `web/` and `monev-mock/` to `ubuntu@213.35.109.129:/home/Documents/shelia-test/` with key `~/.ssh/ssh-key-2025-09-05.key`. Use `rsync --delete` only for `web-app/dist/`, never for the top-level directory. It finishes with `ssh … 'bash -s'`, which runs `docker compose up -d --force-recreate web monev-mock` and `docker exec shelia-test-web nginx -t`.
- [ ] **Step 4: Verify locally:** `docker run --rm -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.29-alpine nginx -t`. Expected: "syntax is ok". If upstream DNS fails offline, verify on the VPS instead.
- [ ] **Step 5: Run the full suite:** `node --test monev-mock/ web/ && (cd web-app && npx vitest run && npm run build)`. Expected: all pass.
- [ ] **Step 6: Commit** `feat: serve redesigned app at /, classic page at /classic/`.
- [ ] **Step 7: Deploy (stop and ask the user before running; it changes the live site).** Run `./deploy.sh`. Then on the VPS, through the container (`docker exec shelia-test-web wget -qSO- http://127.0.0.1/…`), check:
  - `/` returns the app HTML with the CSP header;
  - `/riwayat-maganghub` returns 200 with the same HTML (Review Focus 5);
  - `/classic/` returns 200 and contains `monev-col`;
  - `/api/x` has the sandbox CSP;
  - `/README.md` and `/.git/config` → app HTML or 404, never the file.
