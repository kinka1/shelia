// Aktivitas, Pembelajaran and Kendala from today's commits, written by DeepSeek with the user's key.
// Called from the browser; only messages and file names/counts are sent (see gitCommits.ts).
import { MIN_CHARS } from './dailyLog'
import type { GitCommit } from './gitCommits'

export type LogTexts = { activity_log: string; lesson_learned: string; obstacles: string }

// DeepSeek's current models (api-docs.deepseek.com, checked 2026-11-17; deepseek-chat was retired 2026-07-24).
export const MODELS = [
  { id: 'deepseek-flash', label: 'deepseek-flash (Rekomendasi: cepat dan murah)' },
  { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro (lebih teliti, ±4× lebih mahal)' },
] as const
export type ModelId = (typeof MODELS)[number]['id']
export const DEFAULT_MODEL: ModelId = 'deepseek-flash'
const KEYS = ['activity_log', 'lesson_learned', 'obstacles'] as const
const LONG = 160 // above this, ask once for a shorter text (never cut by code)

const SYSTEM = `Kamu menulis log harian magang (MagangHub Kemnaker) dalam Bahasa Indonesia dari commit hari ini.
Balas HANYA JSON: {"activity_log": "...", "lesson_learned": "...", "obstacles": "..."}.
Aturan untuk setiap field:
- Panjang 100–130 karakter: minimal 100, sesingkat mungkin. Satu atau dua kalimat, tanpa markdown, tanpa hash commit.
- Hanya tulis apa yang ditunjukkan commit (pesan dan nama file). Jangan mengarang fitur, angka, alat, atau nama yang tidak ada.
- Jangan menyalin pesan commit mentah; tulis seperti laporan kerja yang wajar.
- Jika ada lebih dari satu proyek, sebut singkat tiap proyek; tetap 100–130 karakter.
activity_log: apa yang dikerjakan atau diubah hari ini; sebut bagian sistem yang terlihat dari nama file.
lesson_learned: apa yang dipelajari dari pekerjaan itu: teknologi, bagian sistem, atau teknik yang disentuh commit.
obstacles: kendala yang terlihat dari commit (fix, revert, wip, perbaikan berulang, file yang diubah berkali-kali). Jika tidak ada tanda kendala, tulis bahwa tidak ada kendala berarti, lalu sebut singkat hal yang perlu dijaga atau dicek dari pekerjaan itu.`

const one = (c: GitCommit) => {
  const files = c.files.map((f) => `  - ${f.path} (+${f.additions} −${f.deletions})`).join('\n')
  return `Commit: ${c.message.trim()}${files ? `\nFile:\n${files}` : ''}`
}

/** Commits grouped by project, so the texts can name each project when there are several. */
export function describeCommits(commits: GitCommit[]): string {
  const groups = new Map<string, GitCommit[]>()
  for (const c of commits) groups.set(c.repo ?? '', [...(groups.get(c.repo ?? '') ?? []), c])
  return [...groups].map(([repo, cs]) => `${repo ? `Proyek ${repo}:\n` : ''}${cs.map(one).join('\n\n')}`).join('\n\n')
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }
type Call = { texts: LogTexts; raw: string } | { error: string }

async function ask(messages: Msg[], key: string, model: string): Promise<Call> {
  let res: Response
  try {
    res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // Thinking off: three short texts don't need it, and it only adds waiting time and cost.
      body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, temperature: 0.3 }),
    })
  } catch { return { error: 'Tidak bisa menghubungi DeepSeek.' } }
  if (res.status === 401) return { error: 'API key DeepSeek tidak valid.' }
  if (res.status === 402) return { error: 'Saldo DeepSeek habis. Isi saldo di platform.deepseek.com, lalu coba lagi.' }
  if (res.status === 429 || res.status === 503) return { error: 'DeepSeek sedang sibuk. Coba lagi sebentar.' }
  if (res.status === 408 || res.status === 504) return { error: 'DeepSeek terlalu lama menjawab. Coba lagi.' }
  if (!res.ok) return { error: `DeepSeek menolak (HTTP ${res.status}).` }
  const raw: string = (await res.json().catch(() => null))?.choices?.[0]?.message?.content ?? ''
  try {
    const o = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''))
    if (KEYS.some((k) => typeof o?.[k] !== 'string')) throw new Error('shape')
    return { raw, texts: { activity_log: o.activity_log.trim(), lesson_learned: o.lesson_learned.trim(), obstacles: o.obstacles.trim() } }
  } catch { return { error: 'Jawaban DeepSeek tidak bisa dibaca. Coba lagi.' } }
}

/** At most two calls: a second one only to fix a field under 100 or over 160 characters. */
export async function generateLog(commits: GitCommit[], deepseekKey: string, model: string = DEFAULT_MODEL): Promise<LogTexts | { error: string }> {
  const messages: Msg[] = [{ role: 'system', content: SYSTEM }, { role: 'user', content: describeCommits(commits) }]
  const first = await ask(messages, deepseekKey, model)
  if ('error' in first) return first
  const short = KEYS.filter((k) => first.texts[k].length < MIN_CHARS)
  const long = KEYS.filter((k) => first.texts[k].length > LONG)
  if (!short.length && !long.length) return first.texts

  const fix = [
    ...short.map((k) => `${k} baru ${first.texts[k].length} karakter: tulis ulang, minimal 100 karakter.`),
    ...long.map((k) => `${k} ${first.texts[k].length} karakter: buat lebih pendek, 100–130 karakter (tetap minimal 100).`),
  ].join('\n')
  const second = await ask([...messages, { role: 'assistant', content: first.raw }, { role: 'user', content: `${fix}\nBalas JSON lengkap ketiga field.` }], deepseekKey, model)
  if ('error' in second) return short.length ? second : first.texts // only "too long": the first answer is still valid
  // Per field: the retry's text if valid, else the first one if valid; never lose a good answer.
  const out = {} as LogTexts
  for (const k of KEYS) {
    const t = [second.texts[k], first.texts[k]].find((x) => x.length >= MIN_CHARS)
    if (!t) return { error: 'Teks yang dibuat terlalu pendek. Coba lagi.' }
    out[k] = t
  }
  return out
}
