# Reminders in the Shelia MagangHub extension (design, approved in chat)

## Why
Users forget Shelia check-in/out and the MagangHub log. A reminder 15 minutes before each event,
quiet when the thing is already done.

## Approaches
- **Extension reminders (chosen):** chrome.alarms + chrome.notifications in the existing extension.
  No server, tokens never leave the site. Works only while Chrome runs on that computer.
- Calendar file (.ics): no code, reaches the phone, but rings even when done. Not now.
- Web push from the VPS: needs status on the server (tokens) or is blind; rejected.

## Design
- **Events (option A):** Masuk = the shift's `check_in_end` (last moment before Terlambat);
  Pulang = the shift's `check_out_start`. Reminder = event − 15 min, Monday–Friday, Jakarta time.
  Default before any shift is seen: events 08:00 / 17:00.
- **Shift:** the one picked (or the only one) in the Shelia card; the site sends
  `{type:'remind', schedule:{masuk:'HH:MM', pulang:'HH:MM'}}` to the extension.
- **Status:** the Absen page sends `{type:'remind', status:{date, masuk, pulang, log}}` whenever it
  changes (masuk = checked in; pulang = checked in and next action is not check-out; log = today's log
  sent). Only times and flags, never tokens. Stored in chrome.storage.local.
- **Alarms:** `masuk` fires "Absen masuk Shelia" if not checked in today. `pulang` fires one
  notification listing what is still open: absen pulang and/or log MagangHub. Nothing open → silent.
  Status from another day counts as nothing done.
- **Click:** focuses an open test-shelia tab or opens one; when the log is open the URL carries
  `?generate=1`, and Generate runs once if its settings exist and the three texts are empty.
- **Limit:** done-ness is only known from this site (checking in via Shelia's own app shows up the
  next time the site is opened).
- Version 1.2.0; new permissions `alarms`, `notifications`, `storage`; icon `icon.png`.
