# Reminders Implementation Plan

**Spec:** `docs/2026-11-18-reminders-design.md`. Executed inline, TDD, one task each.

1. **Extension:** `extension/remind.js` — `eventMinus15(hhmm)`, `nextAt(hhmm, now)` (next Mon–Fri WIB
   instant strictly after now), `pending(kind, status, today)`; `background.js` handles
   `{type:'remind'}` (validated `HH:MM`, booleans), stores it, re-schedules both alarms; `onAlarm`
   notifies when pending and schedules the next one; notification click opens/focuses the site.
   Tests: `src/lib/extensionRemind.test.ts`.
2. **Site:** `extRemind(msg)` in `lib/extension.ts`; SheliaCard sends the selected shift's schedule;
   Absen sends status; GenerateLog runs once on `?generate=1` when settings exist and fields are empty.
   Tests in the existing page/component tests.
3. Version bump, icon, full suite, build, deploy; user reloads the unpacked extension.
