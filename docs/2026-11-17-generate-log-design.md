# Generate the MagangHub daily log from commits — design

## Intent
Interns fill three MagangHub fields every day (Aktivitas, Pembelajaran, Kendala; each ≥ 100
characters). The user wants a **Generate** button on test-shelia's MagangHub card that writes all
three from the intern's real commits of the day, so the log is genuine, and keeps each text as short
as possible above the 100-character floor, because nobody likes reading long logs. The intern then
reviews and edits before sending (the existing confirmation dialog stays).

## Goals
- One click fills all three fields from **today's commits (WIB) by the intern** in one repo, on
  **all branches**, on GitHub (github.com) or GitLab (gitlab.com or a self-hosted GitLab by link).
- The intern supplies the repo link and their own DeepSeek API key; private repos also need a
  read-only access token (GitHub fine-grained/classic PAT, GitLab `read_api`/`read_repository`).
- Each text: Indonesian, ≥ 100 characters after trim, aimed at 100–130 characters.
- All three are always generated from the commits (user's decision):
  - Aktivitas: what was built/changed.
  - Pembelajaran: what the work touched or required (tools, parts of the system, techniques).
  - Kendala: read from signals in the commits (fix/revert/retry/wip, repeated changes to the same
    files); when there are none, say plainly that there were no notable obstacles, still ≥ 100 chars.
- No commits today → message "Tidak ada commit hari ini", fields untouched.

## Non-goals / anti-goals
- **No code is sent to DeepSeek.** Only commit messages, changed file paths and per-file
  +added/−removed counts (user's decision, 2026-11-17).
- No key, token or commit data passes through our VPS or is stored server-side. Everything runs in
  the browser (GitHub, GitLab and DeepSeek all answer CORS for test-shelia; checked 2026-11-17).
- Never sends the log by itself; Generate only fills the form.
- Anti-goal: invented work. The model must only describe what the commits show.

## Constraints
- Settings stored in this browser's localStorage only: repo link, access token (optional),
  DeepSeek key, Git username (only needed without a token). Shelia's and MagangHub's Keluar don't touch them;
  a "Hapus" in the settings clears them.
- DeepSeek: `POST https://api.deepseek.com/chat/completions`, model `deepseek-chat`, user's key as
  Bearer. Ask for JSON `{activity_log, lesson_learned, obstacles}`.
- A returned text under 100 characters is never put in the form: retry once telling the model which
  field was short; still short → error, fields untouched.
- Reuse `MIN_CHARS` (lib/dailyLog.ts) and the card's `v`/`setV` state.

## Approaches (chosen: 1)
1. **All in the browser** — page calls GitHub/GitLab and DeepSeek directly. Keys stay local.
2. Through the Chrome extension — unnecessary (no CORS problem) and needs an extension update.
3. Through our VPS — would carry keys and repo data through the server; breaks the "keys stay in
   the browser" rule.

## Design (decided)
- **Commits:** GitHub — list branches, list commits per branch with `since`/`until` (today 00:00–
  24:00 WIB) and `author`, dedupe by SHA, then fetch each commit for its files. GitLab — project id
  from the URL path, `GET /projects/:id/repository/commits?all=true&since&until&author`, then
  `/commits/:sha/diff` for paths and counts (only paths/counts leave the page).
- **Author:** see "Who you is" below.
- **UI:** a **Generate** button by the three fields; a small settings dialog (gear) for the four
  settings; first click without settings opens the dialog. Busy state "Membuat…"; errors inline
  (bad token/404, rate limit, DeepSeek 401/402 balance, no commits).
- **Overwrite:** Generate replaces all three fields (the intern reviews before sending).

## Calls made after the builder check (author's, not the user's)
- **Length (user, 2026-11-17: "within minimum limit of 100 characters and keep it as short and as
  preserved as possible"):** the prompt asks for 100–130 characters per field, faithful to the
  commits (no filler). Code checks every field: under 100 → one retry naming the short field; still
  under → error, fields untouched. Over 160 → one retry asking for a shorter text (still ≥ 100);
  still over → the longer valid text is used. Never padded or cut by code.
- **Who "you" is:** with a token, identity comes from the token (GitHub `GET /user`: login + email;
  GitLab `GET /user`: username, name, email, commit_email) and commits are matched client-side on
  any of those. Without a token (public repo) the "Git username" setting is used (GitHub login /
  GitLab username, matched the same way). When the repo has commits today but none match:
  "Ada N commit hari ini, tapi tidak ada dari <identitas>" — never a misleading "tidak ada commit".
- **Merge commits** (more than one parent) are skipped; commits are deduped by SHA across branches.
- **Big days:** GitHub reads at most the 20 most recently updated branches and 30 commits; any
  trimming is stated under the button ("Hanya 30 commit pertama dipakai").
- **Self-hosted GitLab** that blocks the browser (no CORS) → a clear error naming the host; no
  fallback through our server.
- **Storage:** keys and token in localStorage like the existing tokens; inputs are password fields
  with a show toggle; the dialog says they stay in this browser only.
- **Existing text:** Generate replaces all three; the toast offers **Batalkan** to restore the
  previous text.
- **Visibility:** Generate lives inside the form, so it shows only when the form does (extension +
  MagangHub connected, today not yet sent).

## Left to the builder
Prompt wording, limits for huge days (cap commits/files, say when trimmed), branch cap for GitHub
rate limits, exact layout and copy, URL parsing details, test split.
