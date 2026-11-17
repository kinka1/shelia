import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTodayCommits, parseRepo, todayRangeWIB } from './gitCommits'

const NOW = new Date('2026-11-17T10:00:00Z')
const ok = (b: unknown) => new Response(JSON.stringify(b))
type Routes = Record<string, unknown>
/** Answers by URL prefix (longest wins); unmatched → 404. Returns the fetch mock. */
function serve(routes: Routes) {
  const f = vi.fn(async (u: string, _init?: RequestInit) => {
    const key = Object.keys(routes).filter((k) => u.startsWith(k)).sort((a, b) => b.length - a.length)[0]
    if (!key) return new Response('{}', { status: 404 })
    const r = routes[key]
    return r instanceof Response ? r : ok(r)
  })
  vi.stubGlobal('fetch', f)
  return f
}
const gh = 'https://api.github.com'
const ghCommit = (sha: string, login: string, email: string, parents = 1, message = `msg ${sha}`) => ({
  sha, author: { login }, parents: Array.from({ length: parents }, (_, i) => ({ sha: `p${i}` })),
  commit: { message, author: { email, name: login } },
})

afterEach(() => vi.unstubAllGlobals())

describe('todayRangeWIB', () => {
  it('is midnight to midnight in Jakarta', () => {
    expect(todayRangeWIB(NOW)).toEqual({ since: '2026-11-16T17:00:00.000Z', until: '2026-11-17T17:00:00.000Z' })
  })
  it('23:30 WIB is still today, 00:30 WIB is the next day', () => {
    const r = todayRangeWIB(new Date('2026-11-17T16:30:00Z'))
    expect(r.since).toBe('2026-11-16T17:00:00.000Z')
    expect(todayRangeWIB(new Date('2026-11-17T17:30:00Z')).since).toBe('2026-11-17T17:00:00.000Z')
  })
})

describe('parseRepo', () => {
  it('reads GitHub and GitLab links', () => {
    expect(parseRepo('https://github.com/kinka1/shelia.git')).toEqual({ kind: 'github', api: gh, path: 'kinka1/shelia' })
    expect(parseRepo('https://gitlab.example.com/a/b/c')).toEqual({ kind: 'gitlab', api: 'https://gitlab.example.com/api/v4', path: 'a/b/c' })
    expect(parseRepo('nope')).toBeNull()
  })
})

describe('fetchTodayCommits — GitHub', () => {
  const base = { repo: 'https://github.com/o/r', deepseekKey: 'k' }

  it('with a token: your commits on all branches, merges and others skipped, deduped, with file counts', async () => {
    const mine = ghCommit('abc', 'budi', 'b@x.id')
    const f = serve({
      [`${gh}/user`]: { login: 'budi', email: 'b@x.id' },
      [`${gh}/repos/o/r/branches`]: [{ name: 'main' }, { name: 'feat' }],
      [`${gh}/repos/o/r/commits?sha=main`]: [mine, ghCommit('m1', 'budi', 'b@x.id', 2), ghCommit('o1', 'ani', 'a@x.id')],
      [`${gh}/repos/o/r/commits?sha=feat`]: [mine],
      [`${gh}/repos/o/r/commits/abc`]: { files: [{ filename: 'src/a.ts', additions: 3, deletions: 1, patch: '+code' }] },
      [`${gh}/repos/o/r`]: { full_name: 'o/r' },
    })
    const r = await fetchTodayCommits({ ...base, token: 'T' }, NOW)
    expect(r).toEqual({ commits: [{ sha: 'abc', message: 'msg abc', files: [{ path: 'src/a.ts', additions: 3, deletions: 1 }] }], trimmed: false })
    for (const [, init] of f.mock.calls) expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer T')
    const list = f.mock.calls.map(([u]) => u).find((u) => u.includes('commits?sha=main'))!
    expect(list).toContain('since=2026-11-16T17%3A00%3A00.000Z')
    expect(list).toContain('until=2026-11-17T17%3A00%3A00.000Z')
  })

  it('without a token: matches the username', async () => {
    serve({
      [`${gh}/repos/o/r/branches`]: [{ name: 'main' }],
      [`${gh}/repos/o/r/commits?sha=main`]: [ghCommit('abc', 'budi', 'b@x.id')],
      [`${gh}/repos/o/r/commits/abc`]: { files: [] },
      [`${gh}/repos/o/r`]: {},
    })
    const r = await fetchTodayCommits({ ...base, username: 'budi' }, NOW)
    expect('commits' in r && r.commits.map((c) => c.sha)).toEqual(['abc'])
  })

  it('private repo without a token → asks for a token', async () => {
    serve({})
    expect(await fetchTodayCommits({ ...base, username: 'budi' }, NOW)).toEqual({ error: 'Repo tidak ditemukan atau privat. Isi token akses.' })
  })

  it('no commits / only others’ commits', async () => {
    serve({ [`${gh}/repos/o/r/branches`]: [{ name: 'main' }], [`${gh}/repos/o/r/commits?sha=main`]: [], [`${gh}/repos/o/r`]: {} })
    expect(await fetchTodayCommits({ ...base, username: 'budi' }, NOW)).toEqual({ error: 'Tidak ada commit hari ini' })
    serve({
      [`${gh}/repos/o/r/branches`]: [{ name: 'main' }],
      [`${gh}/repos/o/r/commits?sha=main`]: [ghCommit('o1', 'ani', 'a@x.id'), ghCommit('o2', 'ani', 'a@x.id')],
      [`${gh}/repos/o/r`]: {},
    })
    expect(await fetchTodayCommits({ ...base, username: 'budi' }, NOW)).toEqual({ error: 'Ada 2 commit hari ini, tapi tidak ada dari budi' })
  })

  it('keeps 30 commits and says it trimmed', async () => {
    serve({
      [`${gh}/repos/o/r/branches`]: [{ name: 'main' }],
      [`${gh}/repos/o/r/commits?sha=main`]: Array.from({ length: 35 }, (_, i) => ghCommit(`c${i}`, 'budi', 'b@x.id')),
      [`${gh}/repos/o/r/commits/`]: { files: [] },
      [`${gh}/repos/o/r`]: {},
    })
    const r = await fetchTodayCommits({ ...base, username: 'budi' }, NOW)
    expect('commits' in r && [r.commits.length, r.trimmed]).toEqual([30, true])
  })
})

describe('fetchTodayCommits — GitLab', () => {
  const api = 'https://gitlab.example.com/api/v4'
  const proj = `${api}/projects/a%2Fb%2Fc`
  const s = { repo: 'https://gitlab.example.com/a/b/c', deepseekKey: 'k', token: 'G' }

  it('all branches, identity from the token, counts from the diff, PRIVATE-TOKEN header', async () => {
    const f = serve({
      [`${api}/user`]: { username: 'budi', name: 'Budi S', email: 'b@x.id', commit_email: 'b@corp.id' },
      [`${proj}/repository/commits?`]: [
        { id: 'abc', message: 'feat x', author_name: 'Budi S', author_email: 'b@corp.id', parent_ids: ['p'] },
        { id: 'mrg', message: 'Merge', author_name: 'Budi S', author_email: 'b@corp.id', parent_ids: ['p', 'q'] },
        { id: 'oth', message: 'other', author_name: 'Ani', author_email: 'a@x.id', parent_ids: ['p'] },
      ],
      [`${proj}/repository/commits/abc/diff`]: [{ new_path: 'src/a.ts', diff: '--- a\n+++ b\n+one\n+two\n-old\n ctx' }],
      [proj]: {},
    })
    const r = await fetchTodayCommits(s, NOW)
    expect(r).toEqual({ commits: [{ sha: 'abc', message: 'feat x', files: [{ path: 'src/a.ts', additions: 2, deletions: 1 }] }], trimmed: false })
    const list = f.mock.calls.map(([u]) => u).find((u) => u.includes('/repository/commits?'))!
    expect(list).toContain('all=true')
    for (const [, init] of f.mock.calls) expect((init?.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('G')
  })

  it('blocked by the browser (CORS/offline) → names the host', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await fetchTodayCommits(s, NOW)).toEqual({ error: 'Tidak bisa menghubungi gitlab.example.com dari browser.' })
  })
})
