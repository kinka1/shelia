// Aktivitas, Pembelajaran and Kendala from today's commits, written by DeepSeek with the user's key.
// Called from the browser; only messages and file names/counts are sent (see gitCommits.ts).
import { MIN_CHARS } from './dailyLog'
import type { GitCommit } from './gitCommits'

export type LogTexts = { activity_log: string; lesson_learned: string; obstacles: string }
const KEYS = ['activity_log', 'lesson_learned', 'obstacles'] as const
const LONG = 160 // above this, ask once for a shorter text (never cut by code)

const SYSTEM = `Kamu menulis log harian magang (MagangHub Kemnaker) dalam Bahasa Indonesia dari commit hari ini.
Balas HANYA JSON: {"activity_log": "...", "lesson_learned": "...", "obstacles": "..."}.
Aturan untuk setiap field:
- Panjang 100–130 karakter: minimal 100, sesingkat mungkin. Satu atau dua kalimat, tanpa markdown, tanpa hash commit.
- Hanya tulis apa yang ditunjukkan commit (pesan dan nama file). Jangan mengarang fitur, angka, alat, atau nama yang tidak ada.
- Jangan menyalin pesan commit mentah; tulis seperti laporan kerja yang wajar.
activity_log: apa yang dikerjakan atau diubah hari ini; sebut bagian sistem yang terlihat dari nama file.
lesson_learned: apa yang dipelajari dari pekerjaan itu: teknologi, bagian sistem, atau teknik yang disentuh commit.
obstacles: kendala yang terlihat dari commit (fix, revert, wip, perbaikan berulang, file yang diubah berkali-kali). Jika tidak ada tanda kendala, tulis bahwa tidak ada kendala berarti, lalu sebut singkat hal yang perlu dijaga atau dicek dari pekerjaan itu.`

export function describeCommits(commits: GitCommit[]): string {
  return commits.map((c) => {
    const files = c.files.map((f) => `  - ${f.path} (+${f.additions} −${f.deletions})`).join('\n')
    return `Commit: ${c.message.trim()}${files ? `\nFile:\n${files}` : ''}`
  }).join('\n\n')
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }
type Call = { texts: LogTexts; raw: string } | { error: string }

async function ask(messages: Msg[], key: string): Promise<Call> {
  let res: Response
  try {
    res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, response_format: { type: 'json_object' }, temperature: 0.3 }),
    })
  } catch { return { error: 'Tidak bisa menghubungi DeepSeek.' } }
  if (res.status === 401) return { error: 'API key DeepSeek tidak valid.' }
  if (res.status === 402) return { error: 'Saldo DeepSeek habis.' }
  if (res.status === 429) return { error: 'DeepSeek sedang sibuk. Coba lagi sebentar.' }
  if (!res.ok) return { error: `DeepSeek menolak (HTTP ${res.status}).` }
  const raw: string = (await res.json().catch(() => null))?.choices?.[0]?.message?.content ?? ''
  try {
    const o = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''))
    if (KEYS.some((k) => typeof o?.[k] !== 'string')) throw new Error('shape')
    return { raw, texts: { activity_log: o.activity_log.trim(), lesson_learned: o.lesson_learned.trim(), obstacles: o.obstacles.trim() } }
  } catch { return { error: 'Jawaban DeepSeek tidak bisa dibaca. Coba lagi.' } }
}

/** At most two calls: a second one only to fix a field under 100 or over 160 characters. */
export async function generateLog(commits: GitCommit[], deepseekKey: string): Promise<LogTexts | { error: string }> {
  const messages: Msg[] = [{ role: 'system', content: SYSTEM }, { role: 'user', content: describeCommits(commits) }]
  const first = await ask(messages, deepseekKey)
  if ('error' in first) return first
  const short = KEYS.filter((k) => first.texts[k].length < MIN_CHARS)
  const long = KEYS.filter((k) => first.texts[k].length > LONG)
  if (!short.length && !long.length) return first.texts

  const fix = [
    ...short.map((k) => `${k} baru ${first.texts[k].length} karakter: tulis ulang, minimal 100 karakter.`),
    ...long.map((k) => `${k} ${first.texts[k].length} karakter: buat lebih pendek, 100–130 karakter (tetap minimal 100).`),
  ].join('\n')
  const second = await ask([...messages, { role: 'assistant', content: first.raw }, { role: 'user', content: `${fix}\nBalas JSON lengkap ketiga field.` }], deepseekKey)
  if ('error' in second) return second
  if (KEYS.some((k) => second.texts[k].length < MIN_CHARS)) return { error: 'Teks yang dibuat terlalu pendek. Coba lagi.' }
  return second.texts
}
