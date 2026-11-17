// Today's commits by the user from one or more GitHub/GitLab repos, read straight from the browser.
// Only messages, file paths and +/− counts are kept: no code leaves this module.
import { todayWIB } from './dailyLog'

export type GitFile = { path: string; additions: number; deletions: number }
export type GitCommit = { sha: string; message: string; files: GitFile[]; repo?: string }
export type RepoLink = { url: string; token?: string }
/** `repo`/`token` are the single-repo settings saved before several repos were allowed. */
export type Settings = { repos?: RepoLink[]; repo?: string; token?: string; deepseekKey: string; username?: string; model?: string }
type Result = { commits: GitCommit[]; trimmed: boolean; note?: string } | { error: string }

const MAX_COMMITS = 30
const MAX_BRANCHES = 20
const GITLAB_PAGES = 5 // 500 commits a day is plenty
const NOT_FOUND = 'Repo tidak ditemukan atau privat. Isi token akses.'

export function repoLinks(s: Settings): RepoLink[] {
  const list = s.repos?.length ? s.repos : s.repo ? [{ url: s.repo, token: s.token }] : []
  return list.filter((r) => r.url?.trim())
}

/** https, www., ssh:// and scp-style (git@host:path) links; GitHub by host, anything else GitLab. */
export function parseRepo(url: string): { kind: 'github' | 'gitlab'; api: string; path: string; host: string } | null {
  let raw = url.trim()
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(raw)
  if (scp) raw = `https://${scp[1]}/${scp[2]}`
  let u: URL
  try { u = new URL(raw.replace(/^ssh:\/\//, 'https://')) } catch { return null }
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\/-\/.*$/, '').replace(/\.git$/, '')
  if (!path.includes('/')) return null
  if (host === 'github.com') return { kind: 'github', api: 'https://api.github.com', path: path.split('/').slice(0, 2).join('/'), host }
  return { kind: 'gitlab', api: `https://${host}${u.port ? `:${u.port}` : ''}/api/v4`, path, host }
}

const TOKEN_NAME = 'Shelia Generate'
const TOKEN_NOTE = 'Baca commit untuk log harian MagangHub (Phoenix).'

/** The site's own "new token" page, pre-filled read-only (documented URL parameters of both sites):
 *  GitHub fine-grained token with Contents: read for the repo owner, 366 days (the maximum);
 *  GitLab (also self-hosted) with the read_api scope. */
export function tokenUrl(repoUrl: string): { href: string; site: 'GitHub' | 'GitLab' } | null {
  const r = parseRepo(repoUrl)
  if (!r) return null
  if (r.kind === 'github') {
    const p = new URLSearchParams({ name: TOKEN_NAME, description: TOKEN_NOTE, target_name: r.path.split('/')[0], expires_in: '366', contents: 'read' })
    return { href: `https://github.com/settings/personal-access-tokens/new?${p}`, site: 'GitHub' }
  }
  const p = new URLSearchParams({ name: TOKEN_NAME, description: TOKEN_NOTE, scopes: 'read_api' })
  return { href: `${r.api.replace(/\/api\/v4$/, '')}/-/user_settings/personal_access_tokens?${p}`, site: 'GitLab' }
}

/** 00:00–24:00 in Jakarta (UTC+7, no DST) as UTC ISO strings. */
export function todayRangeWIB(now = new Date()): { since: string; until: string } {
  return rangeWIB({ from: todayWIB(now), until: todayWIB(now) })
}

/** Chosen days (YYYY-MM-DD, inclusive): 00:00 of the first to 24:00 of the last, Jakarta time. */
export type Days = { from: string; until: string }
export function rangeWIB(d: Days): { since: string; until: string } {
  const since = new Date(`${d.from}T00:00:00+07:00`)
  const end = new Date(new Date(`${d.until}T00:00:00+07:00`).getTime() + 86_400_000)
  return { since: since.toISOString(), until: end.toISOString() }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
/** "10–12 Nov 2026", "28 Okt – 3 Nov 2026", "10 Nov 2026". */
export function periodLabel(d: Days): string {
  const [fy, fm, fd] = d.from.split('-').map(Number), [uy, um, ud] = d.until.split('-').map(Number)
  if (d.from === d.until) return `${fd} ${MONTHS[fm - 1]} ${fy}`
  if (fy === uy && fm === um) return `${fd}–${ud} ${MONTHS[um - 1]} ${uy}`
  return `${fd} ${MONTHS[fm - 1]}${fy === uy ? '' : ` ${fy}`} – ${ud} ${MONTHS[um - 1]} ${uy}`
}

class HttpError extends Error { constructor(public status: number) { super(String(status)) } }
class NetError extends Error {}
class BadAnswer extends Error {}

/** Every repo is read; one failing doesn't stop the others, and it is named in the note. */
export async function fetchTodayCommits(s: Settings, now = new Date(), days?: Days): Promise<Result> {
  const today = todayWIB(now)
  const d = days ?? { from: today, until: today }
  const span: Span = { ...rangeWIB(d), when: d.from === today && d.until === today ? 'hari ini' : `pada ${periodLabel(d)}` }
  const NO_COMMITS = `Tidak ada commit ${span.when}`
  const links = repoLinks(s)
  if (!links.length) return { error: 'Isi minimal satu link repo.' }
  const results = await Promise.all(links.map(async (l) => ({ label: parseRepo(l.url)?.path ?? l.url, r: await oneRepo(l, s.username, span) })))
  const label = (x: { label: string }, msg: string) => (links.length > 1 ? `${x.label}: ${msg}` : msg)
  const ok = results.filter((x) => 'commits' in x.r)
  const quiet = (m: string) => m === NO_COMMITS || m.startsWith('Ada ') // not failures: just nothing of yours in the period
  const failed = results.filter((x) => 'error' in x.r && !quiet(x.r.error))
  if (!ok.length) {
    if (failed.length) return { error: failed.map((x) => label(x, (x.r as { error: string }).error)).join('\n') }
    const others = results.filter((x) => (x.r as { error: string }).error.startsWith('Ada '))
    return { error: others.length ? others.map((x) => label(x, (x.r as { error: string }).error)).join('\n') : NO_COMMITS }
  }
  const all = ok.flatMap((x) => (x.r as { commits: GitCommit[] }).commits)
  const notes = [
    ...ok.map((x) => (x.r as { note?: string }).note && label(x, (x.r as { note: string }).note)),
    ...failed.map((x) => label(x, (x.r as { error: string }).error)),
  ].filter(Boolean)
  return {
    commits: all.slice(0, MAX_COMMITS),
    trimmed: all.length > MAX_COMMITS || ok.some((x) => (x.r as { trimmed: boolean }).trimmed),
    ...(notes.length ? { note: notes.join('\n') } : {}),
  }
}

async function oneRepo(link: RepoLink, username: string | undefined, span: Span): Promise<Result> {
  const repo = parseRepo(link.url)
  if (!repo) return { error: 'Link repo tidak dikenali. Contoh: https://github.com/nama/repo' }
  const token = link.token?.trim()
  const headers: Record<string, string> = repo.kind === 'github'
    ? { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    : { ...(token ? { 'PRIVATE-TOKEN': token } : {}) }
  const get = async (url: string, list = false) => {
    let r: Response
    try { r = await fetch(url, { headers }) } catch { throw new NetError() }
    if (!r.ok) throw new HttpError(r.status)
    let body: unknown
    try { body = await r.json() } catch { throw new BadAnswer() }
    if (list && !Array.isArray(body)) throw new BadAnswer()
    return body as any
  }
  try {
    const res = await (repo.kind === 'github' ? github : gitlab)(repo.api, repo.path, { token, username }, get, span)
    return 'commits' in res ? { ...res, commits: res.commits.map((c) => ({ ...c, repo: repo.path })) } : res
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 401) return { error: 'Token akses ditolak. Periksa tokennya.' }
      if (e.status === 404) return { error: NOT_FOUND }
      if (e.status === 403 || e.status === 429) return { error: 'Batas akses API tercapai. Coba lagi nanti atau isi token akses.' }
      return { error: `Gagal membaca repo (HTTP ${e.status}).` }
    }
    if (e instanceof NetError) return { error: `Tidak bisa menghubungi ${repo.host} dari browser.` }
    return { error: `Jawaban ${repo.host} tidak bisa dibaca.` }
  }
}

type Get = (url: string, list?: boolean) => Promise<any>
type Span = { since: string; until: string; when: string } // when: "hari ini" or "pada 10–12 Nov 2026"
type Who = { token?: string; username?: string }
const q = (o: Record<string, string>) => new URLSearchParams(o).toString()

/** Keeps the user's non-merge commits (newest first as listed), or the right message. */
function pick<T>(all: T[], mine: (c: T) => boolean, who: string, when: string): { mine: T[]; trimmed: boolean } | { error: string } {
  if (!all.length) return { error: `Tidak ada commit ${when}` }
  const m = all.filter(mine)
  if (!m.length) return { error: `Ada ${all.length} commit ${when}, tapi tidak ada dari ${who}` }
  return { mine: m.slice(0, MAX_COMMITS), trimmed: m.length > MAX_COMMITS }
}

async function github(api: string, path: string, w: Who, get: Get, { when, ...range }: Span): Promise<Result> {
  const me = w.token ? await get(`${api}/user`) : { login: w.username }
  const ids = [me.login, me.email].filter(Boolean).map((x: string) => x.toLowerCase())
  const info = await get(`${api}/repos/${path}`)
  const main: string = info.default_branch || 'main'
  // Without a token GitHub allows 60 requests an hour: read only the default branch.
  // With one: the default branch first, then others as listed, 20 at most (said when skipped).
  let names = [main]
  let note: string | undefined
  if (w.token) {
    const all: string[] = (await get(`${api}/repos/${path}/branches?per_page=100`, true)).map((b: { name: string }) => b.name)
    names = [main, ...all.filter((n) => n !== main)]
    if (names.length > MAX_BRANCHES) { names = names.slice(0, MAX_BRANCHES); note = `Hanya ${MAX_BRANCHES} branch yang dibaca` }
  }
  const seen = new Map<string, any>()
  for (const name of names) {
    const list: any[] = await get(`${api}/repos/${path}/commits?sha=${encodeURIComponent(name)}&${q({ ...range, per_page: '100' })}`, true)
    for (const c of list) if ((c.parents?.length ?? 1) <= 1 && !seen.has(c.sha)) seen.set(c.sha, c)
  }
  // author is null when the commit email isn't linked to a GitHub account: the email still counts.
  const isMine = (c: any) => [c.author?.login, c.commit?.author?.email].some((x) => x && ids.includes(String(x).toLowerCase()))
  const p = pick([...seen.values()], isMine, me.login || me.email || 'Anda', when)
  if ('error' in p) return p
  const commits = await Promise.all(p.mine.map(async (c) => {
    const d = await get(`${api}/repos/${path}/commits/${c.sha}`)
    const files: GitFile[] = (d.files || []).map((f: any) => ({ path: f.filename, additions: f.additions, deletions: f.deletions }))
    return { sha: c.sha, message: c.commit.message, files }
  }))
  return { commits, trimmed: p.trimmed, ...(note ? { note } : {}) }
}

/** + and − lines of a GitLab diff: ---/+++ are file headers only before the first @@; after it every line counts. */
function countDiff(diff: string): { additions: number; deletions: number } {
  const lines = String(diff || '').split('\n')
  const at = lines.findIndex((l) => l.startsWith('@@'))
  const head = (at < 0 ? lines : lines.slice(0, at)).filter((l) => !l.startsWith('+++') && !l.startsWith('---'))
  const body = [...head, ...(at < 0 ? [] : lines.slice(at).filter((l) => !l.startsWith('@@')))]
  return { additions: body.filter((l) => l.startsWith('+')).length, deletions: body.filter((l) => l.startsWith('-')).length }
}

async function gitlab(api: string, path: string, w: Who, get: Get, { when, ...range }: Span): Promise<Result> {
  const proj = `${api}/projects/${encodeURIComponent(path)}`
  const me = w.token ? await get(`${api}/user`) : { username: w.username }
  const ids = [me.username, me.name, me.email, me.commit_email, me.public_email].filter(Boolean).map((x: string) => x.toLowerCase())
  await get(proj)
  const list: any[] = []
  for (let page = 1; page <= GITLAB_PAGES; page++) {
    const batch: any[] = await get(`${proj}/repository/commits?${q({ ...(page > 1 ? { page: String(page) } : {}), all: 'true', ...range, per_page: '100' })}`, true)
    list.push(...batch)
    if (batch.length < 100) break
  }
  const all = list.filter((c) => (c.parent_ids?.length ?? 1) <= 1)
  // Without a token only a username is known: also accept it as the start of the commit email.
  const isMine = (c: any) => [c.author_name, c.author_email, c.committer_email].some((x) => {
    const v = String(x || '').toLowerCase()
    return v && (ids.includes(v) || (!w.token && ids.some((i) => v.startsWith(`${i}@`))))
  })
  const p = pick(all, isMine, me.username || me.email || 'Anda', when)
  if ('error' in p) return p
  const commits = await Promise.all(p.mine.map(async (c) => {
    const diffs: any[] = await get(`${proj}/repository/commits/${c.id}/diff?per_page=100`, true)
    return { sha: c.id, message: c.message, files: diffs.map((d) => ({ path: d.new_path, ...countDiff(d.diff) })) }
  }))
  return { commits, trimmed: p.trimmed }
}
