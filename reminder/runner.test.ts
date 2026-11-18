import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openStore } from './store.ts'
import { createRunner } from './runner.ts'
import { renderLibur } from './render.ts'

const WED = '2026-11-18', SAT = '2026-11-21'
const at = (time: string, date = WED) => new Date(`${date}T${time}+07:00`)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function setup(o: { failSends?: number } = {}) {
  const store = openStore(':memory:')
  const sent: { html: string; silent: boolean; id: number }[] = []
  const edits: { id: number; html: string }[] = []
  let fails = o.failSends ?? 0
  let nextId = 100
  const tg = {
    async send(html: string, silent: boolean) { if (fails > 0) { fails--; return null } const id = nextId++; sent.push({ html, silent, id }); return id },
    async edit(id: number, html: string) { edits.push({ id, html }); return true },
  }
  let clock = at('07:00:00')
  const mk = () => createRunner({ store, tg, now: () => clock, debounceMs: 10 })
  return { store, sent, edits, mk, set: (d: Date) => { clock = d } }
}

test('07:45 posts the masuk table once, loud', async () => {
  const s = setup(); const r = s.mk()
  s.store.patchPerson('a@x.id', { shelia: true, sheliaName: 'Bagas' })
  s.set(at('07:44:59')); await r.tick()
  assert.equal(s.sent.length, 0)
  s.set(at('07:45:00')); await r.tick()
  s.set(at('07:45:01')); await r.tick()
  assert.equal(s.sent.length, 1)
  assert.match(s.sent[0].html, /Absen masuk/)
  assert.equal(s.sent[0].silent, false)
  assert.equal(s.store.getMessage(WED, 'masuk'), s.sent[0].id)
})

test('a restart does not repost; the nudge still comes at 07:55', async () => {
  const s = setup()
  s.store.patchPerson('a@x.id', { shelia: true })
  s.set(at('07:45:00')); await s.mk().tick()
  const r2 = s.mk()
  s.set(at('07:46:00')); await r2.tick()
  assert.equal(s.sent.length, 1)
  s.set(at('07:55:10')); await r2.tick()
  assert.equal(s.sent.length, 2)
  assert.match(s.sent[1].html, /^Masih belum absen masuk Shelia: a$/)
})

test('started late: a still-open table is posted, past nudges are not', async () => {
  const s = setup(); const r = s.mk()
  s.store.patchPerson('a@x.id', { shelia: true })
  s.set(at('09:00:00')); await r.tick()
  assert.deepEqual(s.sent.map((m) => /Absen masuk/.test(m.html)), [true])
  s.set(at('16:46:00', '2026-11-19')); await r.tick() // next day, masuk closed at 16:45, pulang table open
  assert.deepEqual(s.sent.slice(1).map((m) => /Absen pulang/.test(m.html)), [true])
})

test('nobody tracked: no table; someone joining later gets it while the slot is open', async () => {
  const s = setup(); const r = s.mk()
  s.set(at('07:45:00')); await r.tick()
  assert.equal(s.sent.length, 0)
  s.store.patchPerson('a@x.id', { shelia: true })
  s.set(at('08:30:00')); await r.tick()
  assert.equal(s.sent.length, 1)
})

test('23:30 nudge is silent; nudges stop once everyone sent the log', async () => {
  const s = setup(); const r = s.mk()
  s.store.patchPerson('a@x.id', { maganghub: true })
  s.set(at('23:30:00')); await r.tick()
  const n = s.sent.find((m) => m.html.startsWith('Masih belum kirim log'))!
  assert.equal(n.silent, true)
  s.store.markDone('a@x.id', WED, { log: true })
  const before = s.sent.length
  s.set(at('23:59:59')); await r.tick()
  const fin = s.sent.slice(before)
  assert.equal(fin.length, 1)
  assert.match(fin[0].html, /Hasil hari ini[\s\S]*Semua sudah kirim log ✅$/)
  assert.equal(fin[0].silent, true)
})

test('Saturday and holidays post nothing; a holiday set after the table turns it into Libur', async () => {
  const s = setup(); const r = s.mk()
  s.store.patchPerson('a@x.id', { shelia: true })
  s.set(at('07:45:00', SAT)); await r.tick()
  assert.equal(s.sent.length, 0)
  s.set(at('07:45:00')); await r.tick()
  s.store.setHoliday(WED, true)
  await r.holidayChanged(WED)
  assert.deepEqual(s.edits, [{ id: s.sent[0].id, html: renderLibur(WED) }])
  s.set(at('07:55:00')); await r.tick()
  assert.equal(s.sent.length, 1)
})

test('changes are debounced into one edit per live table', async () => {
  const s = setup(); const r = s.mk()
  s.store.patchPerson('a@x.id', { shelia: true, maganghub: true })
  s.set(at('07:45:00')); await r.tick()
  s.set(at('16:45:00')); await r.tick()
  s.store.markDone('a@x.id', WED, { masuk: true }); r.changed(WED)
  s.store.markDone('a@x.id', WED, { pulang: true, log: true }); r.changed(WED)
  await wait(40)
  assert.equal(s.edits.length, 2)
  assert.deepEqual(s.edits.map((e) => e.id).sort(), s.sent.map((m) => m.id).sort())
  assert.ok(s.edits.every((e) => !e.html.includes('❌')))
})

test('a failed send is retried after 30 s, not on every tick; tick never rejects', async () => {
  const s = setup({ failSends: 2 }); const r = s.mk()
  s.store.patchPerson('a@x.id', { shelia: true })
  s.set(at('07:45:00')); await r.tick()
  s.set(at('07:45:01')); await r.tick()
  s.set(at('07:45:29')); await r.tick()
  assert.equal(s.sent.length, 0)
  s.set(at('07:45:30')); await r.tick() // 2nd failure
  s.set(at('07:45:31')); await r.tick()
  assert.equal(s.sent.length, 0)
  s.set(at('07:46:00')); await r.tick()
  assert.equal(s.sent.length, 1)
  const broken = createRunner({ store: s.store, tg: { send: async () => { throw new Error('boom') }, edit: async () => true }, now: () => at('07:55:00') })
  await broken.tick() // must resolve
})

test('overlapping ticks never post the same event twice', async () => {
  const s = setup()
  s.store.patchPerson('a@x.id', { shelia: true })
  let release!: () => void
  const gate = new Promise<void>((res) => { release = res })
  const sends: string[] = []
  const r = createRunner({ store: s.store, tg: { send: async (h: string) => { sends.push(h); await gate; return 1 }, edit: async () => true }, now: () => at('07:45:00') })
  const a = r.tick(); const b = r.tick()
  release(); await Promise.all([a, b])
  assert.equal(sends.length, 1)
})
