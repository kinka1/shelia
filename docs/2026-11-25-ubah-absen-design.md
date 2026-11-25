# Ubah Absen (Superadmin) — design

## Why
A Superadmin tests how the app handles an on-time or late check-in by moving a test
employee's check-in time and status, then watching what follows: check-out, Riwayat,
recaps, reports.

## Goals
- Find any employee's attendance for a day by name.
- Change its check-in time and status in a couple of clicks, as often as needed.
- Show Shelia's own message when it refuses.

## Non-goals
- Editing check-out (the backend has no endpoint for it).
- Deciding on-time vs late: the backend stores the status as sent; the Superadmin picks it.
- Any role other than Superadmin.

## Constraints (backend, origin/develop 87f76d7f)
- `PATCH /api/v2/attendance/admin/{id}/check-in`, `role:Superadmin`.
  Body `{check_in_time: "Y-m-d H:i", status}`, time in Asia/Jakarta,
  status one of `checked_in`, `late`, `completed`, `completedlate`.
  Refuses: own attendance (403 ERR-HR-043), open HR review (409 ERR-HR-085), unknown id (404),
  future time / not before check-out / more than a day from the work date (422).
- `POST /api/admin/attendances` lists attendance: `{start_date, end_date, search, per_page ≤ 100}`,
  returns `data.data[]` with `id` (uuid), `attendance_date`, `status`, `employee.full_name`,
  `check_in_record.check_in_time`, `check_out_record.check_out_time` (ISO, UTC), and `data.meta`.
  `search` matches the employee's full name (not NIK), the date and the status.
- Not yet confirmed that dev-shelia has the PATCH deployed; the first real save tells.

## Approaches
- **A. Superadmin page "Ubah Absen" (chosen):** search a day by name, edit from the row.
- B. Paste-the-id form: least code, but the id has to be dug out by hand every time. Rejected.
- Inside Riwayat: shows only your own attendance, which Shelia refuses. Rejected.

## Design
- **Who sees it:** login keeps `employee.role_name` (Phoenix drops it today). The sidebar item
  "Ubah Absen" (under Alat) and the `/ubah-absen` route exist only when it is `Superadmin`;
  anyone else is sent to `/`. Sessions from before this change have no role, so a Superadmin
  logs in once more. *(my call)*
- **Page:** a date field (today WIB by default) and a name search; one request per change,
  `start_date = end_date = date`, `per_page 100`, debounced search. Rows: name, check-in
  and check-out time in WIB (`–` when missing), status, **Ubah** button. Empty and error states
  in the page's usual alert style.
- **Dialog:** `datetime-local` field prefilled with the current check-in (or the work date
  08:00 if none), so a night shift can pick the next day; status select with the four values.
  Simpan → PATCH → close and reload the list. On error the dialog stays open and shows
  `errorText()` (message, code, field errors). *(my call)*
- **Code:** one `lib/adminAttendance.ts` (list + edit via `sheliaApi`), one page
  `pages/UbahAbsen.tsx`, existing shadcn Dialog/Select/Input/Table. Tests in Vitest/RTL.

## Left to the builder
Exact layout and copy within the existing page style.
