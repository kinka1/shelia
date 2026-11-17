import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateLog } from './generateLog'
import type { GitCommit } from './gitCommits'

const commits: GitCommit[] = [{ sha: 'abc', message: 'feat: tambah ekstensi', files: [{ path: 'src/a.ts', additions: 3, deletions: 1 }] }]
const text = (n: number, c = 'a') => c.repeat(n)
const good = { activity_log: text(110), lesson_learned: text(110, 'b'), obstacles: text(110, 'c') }
const reply = (content: unknown, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }), { status })
function answers(...rs: Response[]) {
  const f = vi.fn()
  for (const r of rs) f.mockResolvedValueOnce(r)
  vi.stubGlobal('fetch', f)
  return f
}
const body = (f: ReturnType<typeof vi.fn>, i: number) => JSON.parse(f.mock.calls[i][1].body)
const all = (f: ReturnType<typeof vi.fn>, i: number) => body(f, i).messages.map((m: any) => m.content).join('\n')

afterEach(() => vi.unstubAllGlobals())

describe('generateLog', () => {
  it('asks DeepSeek with messages and file names only, and returns three valid texts', async () => {
    const f = answers(reply({ activity_log: ` ${good.activity_log} `, lesson_learned: good.lesson_learned, obstacles: good.obstacles }))
    expect(await generateLog(commits, 'K')).toEqual(good)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer K')
    expect(body(f, 0)).toMatchObject({ model: 'deepseek-flash', response_format: { type: 'json_object' }, thinking: { type: 'disabled' } })
    const sent = all(f, 0)
    expect(sent).toContain('feat: tambah ekstensi')
    expect(sent).toContain('src/a.ts (+3 −1)')
    expect(sent).toMatch(/Indonesia/)
    expect(sent).toContain('100–130')
    expect(sent).toMatch(/Jangan menulis "tidak ada kendala"/)
    expect(sent).not.toMatch(/Tidak ada kendala berarti\./)
  })

  it('a short field → one retry naming it; then valid', async () => {
    const f = answers(reply({ ...good, obstacles: text(80) }), reply(good))
    expect(await generateLog(commits, 'K')).toEqual(good)
    expect(all(f, 1)).toMatch(/obstacles[\s\S]*minimal 100 karakter/)
  })

  it('short twice → error, nothing returned', async () => {
    answers(reply({ ...good, obstacles: text(80) }), reply({ ...good, obstacles: text(90) }))
    expect(await generateLog(commits, 'K')).toEqual({ error: 'Teks yang dibuat terlalu pendek. Coba lagi.' })
  })

  it('a long field → one retry asking shorter; still long → the valid long text is used', async () => {
    const long = { ...good, activity_log: text(200) }
    const f = answers(reply(long), reply(long))
    expect(await generateLog(commits, 'K')).toEqual(long)
    expect(f).toHaveBeenCalledTimes(2)
    expect(all(f, 1)).toMatch(/activity_log[\s\S]*lebih pendek/)
  })

  it('a long field whose retry comes back short keeps the valid first text', async () => {
    const long = { ...good, activity_log: text(200) }
    answers(reply(long), reply({ ...good, activity_log: text(95), obstacles: text(120, 'd') }))
    expect(await generateLog(commits, 'K')).toEqual({ ...good, activity_log: text(200), obstacles: text(120, 'd') })
  })

  it('a long field whose retry fails keeps the valid first answer', async () => {
    const long = { ...good, activity_log: text(200) }
    answers(reply(long), new Response('{}', { status: 429 }))
    expect(await generateLog(commits, 'K')).toEqual(long)
  })

  it('names the project of each commit when there are several', async () => {
    const f = answers(reply(good))
    await generateLog([{ ...commits[0], repo: 'o/web' }, { sha: 'g', repo: 'g/api', message: 'fix login', files: [] }], 'K')
    expect(all(f, 0)).toMatch(/Proyek o\/web[\s\S]*Proyek g\/api/)
  })

  it('uses the chosen model', async () => {
    const f = answers(reply(good))
    await generateLog(commits, 'K', 'deepseek-v4-pro')
    expect(body(f, 0).model).toBe('deepseek-v4-pro')
  })

  it('busy, overloaded and timeout answers say so plainly', async () => {
    for (const status of [429, 503]) {
      answers(new Response('{}', { status }))
      expect(await generateLog(commits, 'K')).toEqual({ error: 'DeepSeek sedang sibuk. Coba lagi sebentar.' })
    }
    answers(new Response('{}', { status: 504 }))
    expect(await generateLog(commits, 'K')).toEqual({ error: 'DeepSeek terlalu lama menjawab. Coba lagi.' })
  })

  it('reads JSON inside ```json fences', async () => {
    answers(reply('```json\n' + JSON.stringify(good) + '\n```'))
    expect(await generateLog(commits, 'K')).toEqual(good)
  })

  it('plain errors for a wrong key, no balance, unreadable answer', async () => {
    answers(new Response('{}', { status: 401 }))
    expect(await generateLog(commits, 'K')).toEqual({ error: 'API key DeepSeek tidak valid.' })
    answers(new Response('{}', { status: 402 }))
    expect(await generateLog(commits, 'K')).toEqual({ error: 'Saldo DeepSeek habis. Isi saldo di platform.deepseek.com, lalu coba lagi.' })
    answers(reply('bukan json'))
    expect(await generateLog(commits, 'K')).toEqual({ error: 'Jawaban DeepSeek tidak bisa dibaca. Coba lagi.' })
  })
})

describe('generateLog prompt', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('asks for natural formal Indonesian and names the period when it is not today', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ activity_log: 'a'.repeat(110), lesson_learned: 'b'.repeat(110), obstacles: 'c'.repeat(110) }) } }] })))
    vi.stubGlobal('fetch', f)
    await generateLog([{ sha: 'a', message: 'fix', files: [] }], 'K', 'deepseek-flash', '10–12 Nov 2026')
    const sent = JSON.parse(f.mock.calls[0][1].body).messages.map((m: any) => m.content).join('\n')
    expect(sent).toMatch(/baku/)
    expect(sent).toMatch(/terjemahan/)
    expect(sent).toMatch(/fix bug[\s\S]*endpoint[\s\S]*embed/) // common English dev terms stay English
    expect(sent).toContain('Periode: 10–12 Nov 2026')
  })
})
