# Shelia vs Monev on one page — design (short)

**Intent:** compare Shelia's attendance flow with the Monev mock side by side on the Shelia page
(test-shelia.holo.my.id `/`), seeing each system's requests and responses.

**Goals:** two columns on desktop (≥ 900px), stacked on phones: left = Shelia page as today plus a
"Shelia API log" (every `/api/` call: method, path, sent body, status, response); right = the Monev
mock form, entries and its existing raw request/response. One login (Shelia token) for both; the
Monev column refreshes after a Shelia login/logout without a page reload.

**Non-goals / anti-goals:** no change to the kinka1/shelia repo checkout; no change to Shelia's
behaviour; the log never leaves the tab (no storage, no network); secrets never displayed
(password, login token, face/bypass tokens → `***`; files → `[file <name>, <N> KB]`;
`Authorization` → `Bearer ***`). Never call `*.kemnaker.go.id`.

**Approaches:** (1, chosen) rewrite `index.html` as nginx serves it (`sub_filter`) to add a wrapper,
a Monev column, a stylesheet and two scripts — it stays the real Shelia page. (2) new `/compare.html`
framing both pages — needs relaxing `X-Frame-Options: DENY`, and isn't the Shelia page.
Chosen by Claude (user handed over the how; approved the design).

**Design:** `web/api-log.js` (loaded before `app.js`) wraps `window.fetch`, records same-origin
`/api/` calls with redaction, renders a log card at the end of the Shelia column (newest first,
max 50, clear button), and dispatches a `api-log` DOM event per call. `web/compare.js` loads
`/monev.html`, moves its content into `#monev-col`, loads `/monev.js`, and calls
`window.monevRefresh()` after Shelia `POST /api/auth/login` (200) or `/api/auth/logout`.
`web/compare.css` does the grid. `monev.js` exposes `window.monevRefresh`. The old footer link is
removed; `/monev.html` stays.

**Left to the builder:** exact log card markup (reuse `style.css` classes), breakpoint details.
