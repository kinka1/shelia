import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTodayCommits, parseRepo, todayRangeWIB, tokenUrl } from './gitCommits'

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
    expect(parseRepo('https://github.com/kinka1/shelia.git')).toEqual({ kind: 'github', api: gh, path: 'kinka1/shelia', host: 'github.com' })
    expect(parseRepo('https://gitlab.example.com/a/b/c')).toEqual({ kind: 'gitlab', api: 'https://gitlab.example.com/api/v4', path: 'a/b/c', host: 'gitlab.example.com' })
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
      [`${gh}/repos/o/r`]: { full_name: 'o/r', default_branch: 'main' },
    })
    const r = await fetchTodayCommits({ ...base, token: 'T' }, NOW)
    expect(r).toEqual({ commits: [{ sha: 'abc', message: 'msg abc', repo: 'o/r', files: [{ path: 'src/a.ts', additions: 3, deletions: 1 }] }], trimmed: false })
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
      [`${gh}/repos/o/r`]: { default_branch: 'main' },
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
      [`${gh}/repos/o/r`]: { default_branch: 'main' },
    })
    expect(await fetchTodayCommits({ ...base, username: 'budi' }, NOW)).toEqual({ error: 'Ada 2 commit hari ini, tapi tidak ada dari budi' })
  })

  it('keeps 30 commits and says it trimmed', async () => {
    serve({
      [`${gh}/repos/o/r/branches`]: [{ name: 'main' }],
      [`${gh}/repos/o/r/commits?sha=main`]: Array.from({ length: 35 }, (_, i) => ghCommit(`c${i}`, 'budi', 'b@x.id')),
      [`${gh}/repos/o/r/commits/`]: { files: [] },
      [`${gh}/repos/o/r`]: { default_branch: 'main' },
    })
    const r = await fetchTodayCommits({ ...base, username: 'budi' }, NOW)
    expect('commits' in r && [r.commits.length, r.trimmed]).toEqual([30, true])
  })
})

describe('fetchTodayCommits — GitHub branches and limits', () => {
  const base = { repo: 'https://github.com/o/r', deepseekKey: 'k' }
  it('without a token reads only the default branch (saves the 60/hour limit)', async () => {
    const f = serve({
      [`${gh}/repos/o/r/commits?sha=dev`]: [ghCommit('abc', 'budi', 'b@x.id')],
      [`${gh}/repos/o/r/commits/abc`]: { files: [] },
      [`${gh}/repos/o/r`]: { default_branch: 'dev' },
    })
    await fetchTodayCommits({ ...base, username: 'budi' }, NOW)
    const urls = f.mock.calls.map(([u]) => u)
    expect(urls.some((u) => u.includes('/branches'))).toBe(false)
    expect(urls.filter((u) => u.includes('/commits?'))).toHaveLength(1)
  })
  it('with a token reads the default branch first, and says when branches were skipped', async () => {
    const names = Array.from({ length: 25 }, (_, i) => ({ name: `a${String(i).padStart(2, '0')}` })).concat({ name: 'main' })
    const f = serve({
      [`${gh}/user`]: { login: 'budi' },
      [`${gh}/repos/o/r/branches`]: names,
      [`${gh}/repos/o/r/commits?sha=main`]: [ghCommit('abc', 'budi', 'b@x.id')],
      [`${gh}/repos/o/r/commits?sha=`]: [],
      [`${gh}/repos/o/r/commits/abc`]: { files: [] },
      [`${gh}/repos/o/r`]: { default_branch: 'main' },
    })
    const r = await fetchTodayCommits({ ...base, token: 'T' }, NOW)
    expect(r).toMatchObject({ commits: [{ sha: 'abc' }], note: 'Hanya 20 branch yang dibaca' })
    const lists = f.mock.calls.map(([u]) => u).filter((u) => u.includes('/commits?'))
    expect(lists).toHaveLength(20)
    expect(lists[0]).toContain('sha=main')
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
    expect(r).toEqual({ commits: [{ sha: 'abc', message: 'feat x', repo: 'a/b/c', files: [{ path: 'src/a.ts', additions: 2, deletions: 1 }] }], trimmed: false })
    const list = f.mock.calls.map(([u]) => u).find((u) => u.includes('/repository/commits?'))!
    expect(list).toContain('all=true')
    for (const [, init] of f.mock.calls) expect((init?.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('G')
  })

  it('blocked by the browser (CORS/offline) → names the host', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await fetchTodayCommits(s, NOW)).toEqual({ error: 'Tidak bisa menghubungi gitlab.example.com dari browser.' })
  })
})

describe('several repos', () => {
  const gl = 'https://gitlab.com/api/v4/projects/g%2Fr'
  it('combines today’s commits from every repo, labelled per project', async () => {
    serve({
      [`${gh}/user`]: { login: 'budi' },
      [`${gh}/repos/o/r/branches`]: [{ name: 'main' }],
      [`${gh}/repos/o/r/commits?sha=main`]: [ghCommit('abc', 'budi', 'b@x.id')],
      [`${gh}/repos/o/r/commits/abc`]: { files: [] },
      [`${gh}/repos/o/r`]: { default_branch: 'main' },
      'https://gitlab.com/api/v4/user': { username: 'budi', email: 'b@x.id' },
      [`${gl}/repository/commits?`]: [{ id: 'g1', message: 'fix y', author_name: 'budi', author_email: 'b@x.id', parent_ids: ['p'] }],
      [`${gl}/repository/commits/g1/diff`]: [],
      [gl]: {},
    })
    const r = await fetchTodayCommits({ repos: [{ url: 'https://github.com/o/r', token: 'T' }, { url: 'https://gitlab.com/g/r', token: 'G' }], deepseekKey: 'k' }, NOW)
    expect('commits' in r && r.commits.map((c) => [c.repo, c.sha])).toEqual([['o/r', 'abc'], ['g/r', 'g1']])
  })

  it('one repo failing doesn’t stop the others; the failure is named', async () => {
    serve({
      [`${gh}/repos/o/r/commits?sha=main`]: [ghCommit('abc', 'budi', 'b@x.id')],
      [`${gh}/repos/o/r/commits/abc`]: { files: [] },
      [`${gh}/repos/o/r`]: { default_branch: 'main' },
    })
    const r = await fetchTodayCommits({ repos: [{ url: 'https://github.com/o/r' }, { url: 'https://github.com/o/secret' }], username: 'budi', deepseekKey: 'k' }, NOW)
    expect(r).toMatchObject({ commits: [{ sha: 'abc' }], note: 'o/secret: Repo tidak ditemukan atau privat. Isi token akses.' })
  })

  it('no commits anywhere → one plain message; everything failing → each repo named', async () => {
    serve({ [`${gh}/repos/o/a/commits?`]: [], [`${gh}/repos/o/a`]: { default_branch: 'main' }, [`${gh}/repos/o/b/commits?`]: [], [`${gh}/repos/o/b`]: { default_branch: 'main' } })
    const two = (a: string, b: string) => ({ repos: [{ url: `https://github.com/o/${a}` }, { url: `https://github.com/o/${b}` }], username: 'budi', deepseekKey: 'k' })
    expect(await fetchTodayCommits(two('a', 'b'), NOW)).toEqual({ error: 'Tidak ada commit hari ini' })
    serve({})
    expect(await fetchTodayCommits(two('x', 'y'), NOW)).toEqual({ error: 'o/x: Repo tidak ditemukan atau privat. Isi token akses.\no/y: Repo tidak ditemukan atau privat. Isi token akses.' })
  })
})

describe('edge cases (QA)', () => {
  it('reads www, ssh and scp-style links', () => {
    expect(parseRepo('https://www.github.com/o/r')).toMatchObject({ kind: 'github', path: 'o/r' })
    expect(parseRepo('git@github.com:o/r.git')).toMatchObject({ kind: 'github', path: 'o/r' })
    expect(parseRepo('ssh://git@gitlab.com/g/sub/r.git')).toMatchObject({ kind: 'gitlab', api: 'https://gitlab.com/api/v4', path: 'g/sub/r' })
    expect(parseRepo('https://gitlab.com/g/r/-/tree/main')).toMatchObject({ path: 'g/r' })
  })

  it('GitHub commit with no linked account (author null) is matched by its email', async () => {
    serve({
      [`${gh}/user`]: { login: 'budi', email: 'b@x.id' },
      [`${gh}/repos/o/r/branches`]: [{ name: 'main' }],
      [`${gh}/repos/o/r/commits?sha=main`]: [{ sha: 'n1', author: null, parents: [{}], commit: { message: 'm', author: { email: 'B@X.id' } } }],
      [`${gh}/repos/o/r/commits/n1`]: { files: [] },
      [`${gh}/repos/o/r`]: { default_branch: 'main' },
    })
    const r = await fetchTodayCommits({ repo: 'https://github.com/o/r', token: 'T', deepseekKey: 'k' }, NOW)
    expect('commits' in r && r.commits.map((c) => c.sha)).toEqual(['n1'])
  })

  it('an unreadable answer says so (not "cannot connect")', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    expect(await fetchTodayCommits({ repo: 'https://github.com/o/r', username: 'b', deepseekKey: 'k' }, NOW)).toEqual({ error: 'Jawaban github.com tidak bisa dibaca.' })
  })

  it('GitLab: diff asks for 100 files per page, counts "--" deletions, and pages through commits', async () => {
    const api = 'https://gitlab.com/api/v4/projects/g%2Fr'
    const mine = (i: number) => ({ id: `c${i}`, message: 'm', author_name: 'budi', author_email: 'b@x.id', parent_ids: ['p'] })
    const f = serve({
      'https://gitlab.com/api/v4/user': { username: 'budi', email: 'b@x.id' },
      [`${api}/repository/commits?all=true`]: Array.from({ length: 100 }, (_, i) => ({ ...mine(i), author_email: 'x@y.z', author_name: 'x' })),
      [`${api}/repository/commits?page=2`]: [mine(100)],
      [`${api}/repository/commits/c100/diff`]: [{ new_path: 'q.sql', diff: '@@ -1,2 +1,1 @@\n--- old comment\n-x\n+y' }],
      [api]: {},
    })
    const r = await fetchTodayCommits({ repo: 'https://gitlab.com/g/r', token: 'G', deepseekKey: 'k' }, NOW)
    expect(r).toMatchObject({ commits: [{ sha: 'c100', files: [{ path: 'q.sql', additions: 1, deletions: 2 }] }] })
    expect(f.mock.calls.map(([u]) => u).some((u) => u.includes('/diff?per_page=100'))).toBe(true)
  })
})

describe('tokenUrl (pre-filled "new token" page)', () => {
  it('GitHub: fine-grained, read-only contents, for the repo owner', () => {
    const u = new URL(tokenUrl('https://github.com/kinka1/shelia')!.href)
    expect(u.origin + u.pathname).toBe('https://github.com/settings/personal-access-tokens/new')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      name: 'Shelia Generate', description: 'Baca commit untuk log harian MagangHub (Phoenix).',
      target_name: 'kinka1', expires_in: '366', contents: 'read',
    })
    expect(tokenUrl('https://github.com/kinka1/shelia')!.site).toBe('GitHub')
  })
  it('GitLab (also self-hosted): read_api only', () => {
    const t = tokenUrl('git@gitlab.example.com:g/sub/r.git')!
    const u = new URL(t.href)
    expect(u.origin + u.pathname).toBe('https://gitlab.example.com/-/user_settings/personal_access_tokens')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      name: 'Shelia Generate', description: 'Baca commit untuk log harian MagangHub (Phoenix).', scopes: 'read_api',
    })
    expect(t.site).toBe('GitLab')
  })
  it('no usable link → null', () => expect(tokenUrl('')).toBeNull())
})

describe('date range (Pilih tanggal)', () => {
  it('reads from 00:00 of the first day to 24:00 of the last, Jakarta time', async () => {
    const f = serve({
      [`${gh}/user`]: { login: 'budi', email: 'b@x.id' },
      [`${gh}/repos/o/r/branches`]: [{ name: 'main' }],
      [`${gh}/repos/o/r/commits?sha=main`]: [],
      [`${gh}/repos/o/r`]: { full_name: 'o/r', default_branch: 'main' },
    })
    const r = await fetchTodayCommits({ repo: 'https://github.com/o/r', token: 'T', deepseekKey: 'k' }, NOW, { from: '2026-11-10', until: '2026-11-12' })
    const list = f.mock.calls.map(([u]) => u).find((u) => u.includes('commits?sha=main'))!
    expect(list).toContain('since=2026-11-09T17%3A00%3A00.000Z')
    expect(list).toContain('until=2026-11-12T17%3A00%3A00.000Z')
    expect(r).toEqual({ error: 'Tidak ada commit pada 10–12 Nov 2026' })
  })
})
