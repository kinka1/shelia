# Generate the daily log from commits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Generate button on the MagangHub form that fills Aktivitas, Pembelajaran and Kendala from today's commits, through the user's DeepSeek key, all in the browser.

**Architecture:** Three pieces: `lib/gitCommits.ts` reads today's commits (messages, file paths, +/− counts) from GitHub or GitLab; `lib/generateLog.ts` turns them into three texts via DeepSeek and enforces the length rule; `features/maganghub/GenerateLog.tsx` holds the settings dialog and the button, wired into `MagangHubCard`.

**Tech Stack:** React 19 + TS, Vitest + RTL, shadcn Dialog/Button/Input, sonner, `fetch`.

**Spec:** `docs/2026-11-17-generate-log-design.md`

## Global Constraints
- Browser only: no request to our `/api` or VPS; keys only in localStorage key `generate.settings` (`{ repo, token?, deepseekKey, username? }`).
- Never send code: only commit message, file path, additions, deletions.
- Today = 00:00–24:00 WIB (`Asia/Jakarta`); reuse `todayWIB()` from `lib/dailyLog.ts`.
- `MIN_CHARS = 100` from `lib/dailyLog.ts`. Prompt target 100–130 chars. Under 100 → 1 retry, still under → error. Over 160 → 1 retry, still over → accept. Never pad or cut.
- DeepSeek: `POST https://api.deepseek.com/chat/completions`, `model: 'deepseek-chat'`, `response_format: { type: 'json_object' }`, Bearer key; reply JSON `{activity_log, lesson_learned, obstacles}`; Indonesian.
- Skip merge commits (parents > 1); dedupe by SHA; GitHub ≤ 20 branches (most recently updated), ≤ 30 commits total; say when trimmed.
- Copy: "Tidak ada commit hari ini"; "Ada N commit hari ini, tapi tidak ada dari <identitas>"; "Hanya 30 commit pertama dipakai".

## Review Focus
- Commit at 23:30 WIB (16:30Z) belongs to today, 00:30 WIB next day (17:30Z) does not → Task 1 test `todayRangeWIB`.
- Private GitHub repo without a token returns 404 → "Repo tidak ditemukan atau privat. Isi token akses." → Task 1 test.
- Repo has commits today, none by the user → the "Ada N commit…" message, not "Tidak ada commit" → Task 1 test.
- DeepSeek answers 401 / 402 (no balance) / non-JSON → plain Indonesian error, fields untouched → Task 2 test.
- Double click on Generate → one run (button disabled while busy) → Task 3 test.

---

### Task 1: Today's commits from GitHub or GitLab

**Files:** Create `web-app/src/lib/gitCommits.ts`; Test `web-app/src/lib/gitCommits.test.ts`

**Interfaces — Produces:**
- `type GitFile = { path: string; additions: number; deletions: number }`
- `type GitCommit = { sha: string; message: string; files: GitFile[] }`
- `type Settings = { repo: string; token?: string; deepseekKey: string; username?: string }`
- `parseRepo(url: string): { kind: 'github' | 'gitlab'; api: string; path: string } | null` — `github.com/o/r(.git)` → api `https://api.github.com`; any other host → GitLab, api `https://<host>/api/v4`, path `group/sub/repo` (URL-encoded where used).
- `todayRangeWIB(now?: Date): { since: string; until: string }` — ISO UTC.
- `fetchTodayCommits(s: Settings, now?: Date): Promise<{ commits: GitCommit[]; trimmed: boolean } | { error: string }>`

- [ ] Step 1: Tests (stub `fetch` by URL):
  - `todayRangeWIB(new Date('2026-11-17T10:00:00Z'))` → `{ since: '2026-11-16T17:00:00.000Z', until: '2026-11-17T17:00:00.000Z' }`.
  - `parseRepo('https://github.com/kinka1/shelia.git')` → `{ kind:'github', api:'https://api.github.com', path:'kinka1/shelia' }`; `parseRepo('https://gitlab.example.com/a/b/c')` → gitlab, api `https://gitlab.example.com/api/v4`, path `a/b/c`; `parseRepo('nope')` → null.
  - GitHub with token: identity from `/user` (`login`, `email`); two branches both listing commit `abc` + a merge commit (2 parents) + another author's commit → one commit `abc` with files `[{path:'src/a.ts',additions:3,deletions:1}]` from `/repos/o/r/commits/abc`; requests carry `Authorization: Bearer <token>`; the commits list URL has `since`/`until` from `todayRangeWIB`.
  - GitHub without token: matches `username` against `author.login`.
  - GitHub 404 on `/repos/o/r` → `{ error: 'Repo tidak ditemukan atau privat. Isi token akses.' }`.
  - No commits → `{ error: 'Tidak ada commit hari ini' }`; commits only by others → `{ error: 'Ada 2 commit hari ini, tapi tidak ada dari budi' }`.
  - 35 matching commits → 30 returned, `trimmed: true`.
  - GitLab: `GET <api>/projects/a%2Fb%2Fc/repository/commits?all=true&since=…&until=…`, identity from `/user` (`username`, `name`, `email`, `commit_email`) matched on `author_email`/`author_name`/`committer_email`; files from `/commits/:sha/diff` (`new_path`, + and − counted from `diff` lines starting `+`/`-` excluding `+++`/`---`; only counts kept); token sent as `PRIVATE-TOKEN`.
  - `fetch` rejects (CORS/offline) → `{ error: 'Tidak bisa menghubungi gitlab.example.com dari browser.' }` (host from the repo).
- [ ] Step 2: `cd web-app && npx vitest run src/lib/gitCommits.test.ts` → FAIL (module missing).
- [ ] Step 3: Implement. GitHub branches: `/repos/:p/branches?per_page=100`, take the 20 whose latest commit date is newest (fetching each branch's commits list with `sha=<branch>&since&until&per_page=100`); GitLab `per_page=100`.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat: read today's commits from GitHub or GitLab`.

### Task 2: Three texts from DeepSeek, length enforced

**Files:** Create `web-app/src/lib/generateLog.ts`; Test `web-app/src/lib/generateLog.test.ts`

**Interfaces — Consumes:** `GitCommit` (Task 1). **Produces:**
- `type LogTexts = { activity_log: string; lesson_learned: string; obstacles: string }`
- `generateLog(commits: GitCommit[], deepseekKey: string): Promise<LogTexts | { error: string }>`

- [ ] Step 1: Tests (stub `fetch`):
  - Request: URL/model/`response_format`/Bearer as in Global Constraints; the user message contains each commit message and `src/a.ts (+3 −1)` and contains no diff text; system prompt says Indonesian, 100–130 characters per field, only what the commits show, Kendala from fix/revert/retry signals or "tidak ada kendala berarti".
  - Valid reply (three 110-char texts) → returned trimmed, one call.
  - First reply has `obstacles` of 80 chars → second call whose messages name `obstacles` and "minimal 100 karakter"; second reply valid → returned.
  - Two short replies → `{ error: 'Teks yang dibuat terlalu pendek. Coba lagi.' }`.
  - First reply has a 200-char field → one retry asking shorter; second still 200 → that valid text returned.
  - Reply content wrapped in ```` ```json ```` fences → parsed.
  - 401 → `{ error: 'API key DeepSeek tidak valid.' }`; 402 → `{ error: 'Saldo DeepSeek habis.' }`; non-JSON → `{ error: 'Jawaban DeepSeek tidak bisa dibaca. Coba lagi.' }`.
- [ ] Step 2: `npx vitest run src/lib/generateLog.test.ts` → FAIL.
- [ ] Step 3: Implement; at most 2 calls per click.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat: generate the three log texts with DeepSeek, 100-char floor enforced`.

### Task 3: Settings dialog, Generate button, card wiring

**Files:** Create `web-app/src/features/maganghub/GenerateLog.tsx`, test `GenerateLog.test.tsx`; Modify `MagangHubCard.tsx` (render it above the three textareas, pass `v`/`setV`).

**Interfaces — Consumes:** `fetchTodayCommits`, `Settings` (Task 1); `generateLog`, `LogTexts` (Task 2). **Produces:** `GenerateLog({ value, onChange }: { value: LogTexts; onChange: (v: LogTexts) => void })`; `getGenSettings(): Settings | null`, `setGenSettings(s: Settings)`, `clearGenSettings()` in the same file.

- [ ] Step 1: Tests (mock the two lib modules):
  - No settings → clicking **Generate** opens "Pengaturan Generate" with fields Link repo, Token akses (opsional untuk repo publik), API key DeepSeek, Username Git (hanya tanpa token); keys are `type="password"`; text "Disimpan hanya di browser ini."; **Simpan** writes `generate.settings` and starts generating.
  - With settings: click → button "Membuat…" and disabled; double click → `fetchTodayCommits` called once; success → `onChange` with the three texts and a toast with **Batalkan** that restores the previous value.
  - `{ error }` from either lib → shown inline (`role="alert"`), `onChange` not called.
  - `trimmed: true` → note "Hanya 30 commit pertama dipakai".
  - Gear button reopens settings; **Hapus** clears `generate.settings`.
  - No `fetch` to a URL starting with `/api` or `/maganghub-api` during a run.
- [ ] Step 2: `npx vitest run src/features/maganghub` → FAIL.
- [ ] Step 3: Implement and wire into the card.
- [ ] Step 4: `npx tsc -b && npx vitest run` → all pass; `npm run build` passes.
- [ ] Step 5: Commit `feat: Generate button fills the daily log from today's commits`; `./deploy.sh`.
