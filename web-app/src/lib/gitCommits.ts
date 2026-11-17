// Today's commits by the user from GitHub or GitLab, read straight from the browser (both allow it).
// Only messages, file paths and +/− counts are kept: no code leaves this module.

export type GitFile = { path: string; additions: number; deletions: number }
export type GitCommit = { sha: string; message: string; files: GitFile[] }
export type Settings = { repo: string; token?: string; deepseekKey: string; username?: string }
type Result = { commits: GitCommit[]; trimmed: boolean; note?: string } | { error: string }

const MAX_COMMITS = 30
const MAX_BRANCHES = 20
const NOT_FOUND = 'Repo tidak ditemukan atau privat. Isi token akses.'

export function parseRepo(url: string): { kind: 'github' | 'gitlab'; api: string; path: string } | null {
  let u: URL
  try { u = new URL(url.trim()) } catch { return null }
  const path = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').replace(/\/-\/.*$/, '')
  if (!path.includes('/')) return null
  if (u.hostname === 'github.com') return { kind: 'github', api: 'https://api.github.com', path: path.split('/').slice(0, 2).join('/') }
  return { kind: 'gitlab', api: `${u.origin}/api/v4`, path }
}

/** 00:00–24:00 in Jakarta (UTC+7, no DST) as UTC ISO strings. */
export function todayRangeWIB(now = new Date()): { since: string; until: string } {
  const day = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
  const since = new Date(`${day}T00:00:00+07:00`)
  return { since: since.toISOString(), until: new Date(since.getTime() + 86_400_000).toISOString() }
}

class HttpError extends Error { constructor(public status: number) { super(String(status)) } }

export async function fetchTodayCommits(s: Settings, now = new Date()): Promise<Result> {
  const repo = parseRepo(s.repo)
  if (!repo) return { error: 'Link repo tidak dikenali. Contoh: https://github.com/nama/repo' }
  const headers: Record<string, string> = repo.kind === 'github'
    ? { Accept: 'application/vnd.github+json', ...(s.token ? { Authorization: `Bearer ${s.token}` } : {}) }
    : { ...(s.token ? { 'PRIVATE-TOKEN': s.token } : {}) }
  const get = async (url: string) => {
    const r = await fetch(url, { headers })
    if (!r.ok) throw new HttpError(r.status)
    return r.json()
  }
  try {
    return await (repo.kind === 'github' ? github : gitlab)(repo.api, repo.path, s, get, todayRangeWIB(now))
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 401) return { error: 'Token akses ditolak. Periksa tokennya.' }
      if (e.status === 404) return { error: NOT_FOUND }
      if (e.status === 403 || e.status === 429) return { error: 'Batas akses API tercapai. Coba lagi nanti atau isi token akses.' }
      return { error: `Gagal membaca repo (HTTP ${e.status}).` }
    }
    return { error: `Tidak bisa menghubungi ${new URL(repo.api).hostname === 'api.github.com' ? 'github.com' : new URL(repo.api).hostname} dari browser.` }
  }
}

type Get = (url: string) => Promise<any>
type Range = { since: string; until: string }
const q = (o: Record<string, string>) => new URLSearchParams(o).toString()

/** Keeps the user's non-merge commits (deduped, newest first as listed), or the right message. */
function pick<T>(all: T[], mine: (c: T) => boolean, who: string): { mine: T[]; trimmed: boolean } | { error: string } {
  if (!all.length) return { error: 'Tidak ada commit hari ini' }
  const m = all.filter(mine)
  if (!m.length) return { error: `Ada ${all.length} commit hari ini, tapi tidak ada dari ${who}` }
  return { mine: m.slice(0, MAX_COMMITS), trimmed: m.length > MAX_COMMITS }
}

async function github(api: string, path: string, s: Settings, get: Get, range: Range): Promise<Result> {
  const me = s.token ? await get(`${api}/user`) : { login: s.username }
  const ids = [me.login, me.email].filter(Boolean).map((x: string) => x.toLowerCase())
  const info = await get(`${api}/repos/${path}`)
  const main: string = info.default_branch || 'main'
  // Without a token GitHub allows 60 requests an hour: read only the default branch.
  // With one: the default branch first, then others as listed, 20 at most (said when skipped).
  let names = [main]
  let note: string | undefined
  if (s.token) {
    const all: string[] = (await get(`${api}/repos/${path}/branches?per_page=100`)).map((b: { name: string }) => b.name)
    names = [main, ...all.filter((n) => n !== main)]
    if (names.length > MAX_BRANCHES) { names = names.slice(0, MAX_BRANCHES); note = `Hanya ${MAX_BRANCHES} branch yang dibaca` }
  }
  const seen = new Map<string, any>()
  for (const name of names) {
    const list: any[] = await get(`${api}/repos/${path}/commits?sha=${encodeURIComponent(name)}&${q({ ...range, per_page: '100' })}`)
    for (const c of list) if (c.parents?.length <= 1 && !seen.has(c.sha)) seen.set(c.sha, c)
  }
  const isMine = (c: any) => [c.author?.login, c.commit?.author?.email].some((x) => x && ids.includes(String(x).toLowerCase()))
  const p = pick([...seen.values()], isMine, me.login || me.email || 'Anda')
  if ('error' in p) return p
  const commits = await Promise.all(p.mine.map(async (c) => {
    const d = await get(`${api}/repos/${path}/commits/${c.sha}`)
    const files: GitFile[] = (d.files || []).map((f: any) => ({ path: f.filename, additions: f.additions, deletions: f.deletions }))
    return { sha: c.sha, message: c.commit.message, files }
  }))
  return { commits, trimmed: p.trimmed, ...(note ? { note } : {}) }
}

async function gitlab(api: string, path: string, s: Settings, get: Get, range: Range): Promise<Result> {
  const proj = `${api}/projects/${encodeURIComponent(path)}`
  const me = s.token ? await get(`${api}/user`) : { username: s.username }
  const ids = [me.username, me.name, me.email, me.commit_email, me.public_email].filter(Boolean).map((x: string) => x.toLowerCase())
  await get(proj)
  const list: any[] = await get(`${proj}/repository/commits?${q({ all: 'true', ...range, per_page: '100' })}`)
  const all = list.filter((c) => (c.parent_ids?.length ?? 1) <= 1)
  // Without a token only a username is known: also accept it as the start of the commit email.
  const isMine = (c: any) => [c.author_name, c.author_email, c.committer_email].some((x) => {
    const v = String(x || '').toLowerCase()
    return v && (ids.includes(v) || (!s.token && ids.some((i) => v.startsWith(`${i}@`))))
  })
  const p = pick(all, isMine, me.username || me.email || 'Anda')
  if ('error' in p) return p
  const commits = await Promise.all(p.mine.map(async (c) => {
    const diffs: any[] = await get(`${proj}/repository/commits/${c.id}/diff`)
    const files = diffs.map((d) => {
      const lines = String(d.diff || '').split('\n')
      return {
        path: d.new_path,
        additions: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length,
        deletions: lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length,
      }
    })
    return { sha: c.id, message: c.message, files }
  }))
  return { commits, trimmed: p.trimmed }
}
