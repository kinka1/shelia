import type { Slot } from './schedule.ts'

export type Row = { name: string; shelia: boolean; maganghub: boolean; masuk: boolean; pulang: boolean; log: boolean }

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

// Monospace cell: lead spaces, the mark (✅/❌ render 2 columns wide, – one), padded to width.
const NA = '–'
const cell = (mark: string, lead: number, width: number) => ' '.repeat(lead) + mark + ' '.repeat(width - lead - (mark === NA ? 1 : 2))
const mark = (on: boolean, done: boolean) => (on ? (done ? '✅' : '❌') : NA)
const nameCol = (name: string) => esc([...name].slice(0, 8).join('').padEnd(10))
const short = (name: string) => esc([...name].slice(0, 8).join(''))

const tracked = (slot: Slot, rows: Row[]) => rows.filter((r) => (slot === 'masuk' ? r.shelia : r.shelia || r.maganghub))

function grid(slot: Slot, rows: Row[]): string {
  const lines = slot === 'masuk'
    ? ['Nama      Shelia', '────────  ──────', ...rows.map((r) => nameCol(r.name) + cell(mark(r.shelia, r.masuk), 2, 6))]
    : ['Nama      Shelia  MagangHub', '────────  ──────  ─────────',
       ...rows.map((r) => nameCol(r.name) + cell(mark(r.shelia, r.pulang), 2, 6) + '  ' + cell(mark(r.maganghub, r.log), 4, 9))]
  return `<pre>${lines.map((l) => l.trimEnd()).join('\n')}</pre>`
}

// Only the items that get nudges count as "belum": Shelia masuk in the morning, the MagangHub log later.
const missing = (slot: Slot, rows: Row[]) => slot === 'masuk' ? rows.filter((r) => r.shelia && !r.masuk) : rows.filter((r) => r.maganghub && !r.log)

export function renderTable(slot: Slot, date: string, rows: Row[]): string {
  const t = tracked(slot, rows)
  const m = missing(slot, t)
  const title = slot === 'masuk' ? `⏰ <b>Absen masuk</b> · ${dayLabel(date)} · 07:45` : `⏰ <b>Absen pulang</b> · ${dayLabel(date)} · 16:45`
  const tail = m.length ? `Belum: ${m.map((r) => `${short(r.name)} (${slot === 'masuk' ? 'Shelia' : 'MagangHub'})`).join(', ')}` : 'Semua sudah ✅'
  return [title, '', grid(slot, t), '', tail].join('\n')
}

export function renderNudge(slot: Slot, rows: Row[]): string | null {
  const m = missing(slot, rows)
  if (!m.length) return null
  const what = slot === 'masuk' ? 'absen masuk Shelia' : 'kirim log MagangHub'
  return `Masih belum ${what}: ${m.map((r) => short(r.name)).join(', ')}`
}

export function renderFinal(date: string, rows: Row[]): string {
  const t = tracked('pulang', rows)
  const m = missing('pulang', t)
  const tail = m.length ? `Tidak kirim log: ${m.map((r) => short(r.name)).join(', ')}` : 'Semua sudah kirim log ✅'
  return [`🏁 <b>Hasil hari ini</b> · ${dayLabel(date)}`, '', grid('pulang', t), '', tail].join('\n')
}

export const renderLibur = (date: string) => `🏖️ <b>Libur hari ini</b> · ${dayLabel(date)}`
