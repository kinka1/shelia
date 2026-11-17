# Riwayat: one page, month calendar (design)

Status: awaiting approval.

## Why
Riwayat Shelia and Riwayat MagangHub are two pages with two tables. The user wants one page with the
admin panel's month calendar card (`admin-panel/src/pages/dashboard/meBands/MonthBand.tsx`), using the
admin panel's status words, so a day reads as "did I attend, and did I send my log".

## Approaches
- **A (chosen by the user):** one calendar. Each day is coloured by Shelia attendance; a ✓ marks a
  MagangHub log sent that day. Click a day for its details.
- B: two calendars side by side. Rejected: twice the space, same dates in two places.

## Design
- **Route:** one page `/riwayat`, sidebar item "Riwayat". `/riwayat-shelia` and `/riwayat-maganghub`
  redirect to it.
- **Card header:** month title ("November 2026"), ‹ and › buttons (› disabled on the current month),
  and "Bulan ini".
- **Calendar:** Monday-first grid, one square per day.
  - Colour per day, admin panel dashboard buckets and tones: Hadir (green), Terlambat (yellow),
    Izin / Cuti / Dinas (purple), Tidak hadir (red), Belum absen (yellow, today only),
    Libur (weekend without a row, grey), Tidak ada catatan (past weekday without a row, grey).
    Future days are plain.
  - Status grouping copied from `admin-panel/src/pages/attendance/attendanceRecord.ts`
    (lower-cased): CUTI = leave, annual_leave; IZIN = day_off, permission, sick;
    TERLAMBAT = late, completedlate, done_late (or a check-in whose status is late);
    DINAS = business_trip, completedtrip; HADIR = completed, checked_in, checked_out,
    pending_review, done, on_break, corrected, present; anything else = Tidak hadir
    (server rule: unknown falls to Alpha). Several sessions in a day: Terlambat beats Hadir.
  - ✓ in the corner when MagangHub has a log for that date.
  - A legend under the calendar, including "✓ Log MagangHub terkirim".
  - Today outlined, as in the admin panel.
- **Beside the calendar (stacked on phones):** Hadir "x dari y hari kerja" (Mon–Fri up to today),
  Terlambat, Tidak hadir, Log MagangHub terkirim. No ring, no month-over-month deltas.
- **Day details (below the calendar, for the selected day, default today):** Shelia sessions
  (shift, check-in, check-out, status label) and the MagangHub log (review status, Aktivitas,
  Pembelajaran, Kendala), or "Belum ada log".
- **Data:**
  - Shelia: `GET /api/v2/attendance/user/month?month=YYYY-MM` (verified on the dev server
    2026-11-17: `{status, message, data: rows[]}`, one row per session, `attendance_date`
    "YYYY-MM-DD 00:00:00", `check_in.check_in_time`).
  - MagangHub: `fetchDailyLogs` pages until the logs are older than the month (max 10 pages).
  - Each source fails or is disconnected on its own: the calendar still shows the other, with a
    one-line notice ("Shelia belum login" / "MagangHub belum terhubung", link to Absen).
- **Removed:** the two tables (search, pagination) and the browser-saved Shelia history
  (`shelia.history`), which the server data replaces.

## Left to the builder
Component split, exact Tailwind classes (match the admin panel card and tones), loading skeleton.
