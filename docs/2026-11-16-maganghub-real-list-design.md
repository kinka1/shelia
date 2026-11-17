# Real MagangHub list on the compare page — design (short)

**Intent:** the user is tired of checking Shelia and the real MagangHub Monev site back and forth. Show
their own real MagangHub daily logs on the test site, next to Shelia — read-only.

**Goals:** a "MagangHub" card at the top of the Monev column (and on `/monev.html`) listing the user's
real daily logs (date, clock-in, status, activity, lesson, obstacles), newest first, paged. No token
copy-paste: a bookmarklet run on the real MagangHub tab hands the token over.

**Non-goals / anti-goals:** never write to MagangHub (no POST/PUT/PATCH/DELETE, only GET of
`daily-logs` and `holidays`); never handle the Kemnaker password or run the SSO login (the login uses
Cloudflare Turnstile, and it would put credentials on our server); never store or log the token on the
server; the mock form stays as is and never talks to the real API.

**Facts found (MagangHub's public bundle and headers, 2026-11-16):** token kept in
`sessionStorage["monev_access_token"]` on `https://monev.maganghub.kemnaker.go.id`; API
`https://monev-api.maganghub.kemnaker.go.id/api/v1`, `Authorization: Bearer <token>`, 401 JSON when
missing/invalid; CORS only allows MagangHub's own origin (so our server forwards); MagangHub CSP has
`script-src 'unsafe-inline'` (bookmarklets run); `Cross-Origin-Opener-Policy: same-origin` (no
`window.opener`/postMessage handoff).

**Approaches:** (1, chosen) bookmarklet opens `https://test-shelia.holo.my.id/#mh=<token>` in a new tab;
the URL fragment is never sent to any server; our page stores it in `localStorage` and strips the
fragment. (2) login form on our site — impossible in-browser (CORS), and via our server it would see
the password. (3) paste token — works, but the user rejected it as tedious. (4) postMessage handoff —
blocked by MagangHub's COOP. Chosen with the user.

**Design:** `web/maganghub.js` (IIFE, no globals except what tests need): on load, takes `#mh=` from
`location.hash` → `localStorage["maganghub.token"]`, `history.replaceState` to drop the fragment;
renders the card (bookmarklet link to drag, status line, list with paging, "Keluar" to forget the token);
fetches `GET /maganghub-api/v1/daily-logs?page=N` with the token; 401 → "token kedaluwarsa, buka
MagangHub lalu klik tombol lagi". nginx: exact-match GET-only locations forwarding to the real API with
cookies, Origin, Referer and Cloudflare Access headers stripped, upstream TLS verified, upstream
`Set-Cookie` hidden.

**Left to the builder:** card markup (reuse `style.css`), defensive rendering of unknown fields.
