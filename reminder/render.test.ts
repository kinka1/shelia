import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderFinal, renderLibur, renderNudge, renderTable, type Row } from './render.ts'

const r = (name: string, o: Partial<Row> = {}): Row => ({ name, shelia: false, maganghub: false, masuk: false, pulang: false, log: false, ...o })
const rows = [r('Bagas', { shelia: true, maganghub: true, pulang: true }), r('Rina', { shelia: true }), r('Dimas', { maganghub: true, log: true })]

test('pulang table', () => {
  assert.equal(renderTable('pulang', '2026-11-18', rows), [
    '⏰ <b>Absen pulang</b> · Rabu 18 Nov · 16:45', '',
    '<pre>Nama      Shelia  MagangHub',
    '────────  ──────  ─────────',
    'Bagas       ✅        ⏳',
    'Rina        ⏳        –',
    'Dimas       –         ✅</pre>', '',
    'Belum: Bagas (MagangHub)'].join('\n'))
})

test('masuk table has only Shelia people and the Shelia column', () => {
  const t = renderTable('masuk', '2026-11-18', rows)
  assert.match(t, /^⏰ <b>Absen masuk<\/b> · Rabu 18 Nov · 07:45/)
  assert.ok(!t.includes('Dimas') && !t.includes('MagangHub'))
  assert.match(t, /Belum: Bagas \(Shelia\), Rina \(Shelia\)$/)
})

test('at the end of the day, still-open items turn from ⏳ to ❌', () => {
  const t = renderTable('pulang', '2026-11-18', rows, { ended: true })
  assert.ok(t.includes('Bagas       ✅        ❌') && t.includes('Rina        ❌        –') && !t.includes('⏳'))
  assert.ok(renderFinal('2026-11-18', rows).includes('Bagas       ✅        ❌') && !renderFinal('2026-11-18', rows).includes('⏳'))
})

test('all done', () => assert.match(renderTable('masuk', '2026-11-18', [r('A', { shelia: true, masuk: true })]), /Semua sudah ✅$/))

test('people on no platform are skipped', () => assert.ok(!renderTable('pulang', '2026-11-18', [r('Ghost')]).includes('Ghost')))

test('names are escaped and cut to 8', () => {
  const t = renderTable('pulang', '2026-11-18', [r('<b>&Panjangsekali', { maganghub: true })])
  assert.ok(t.includes('&lt;b&gt;&amp;Pan') && !t.includes('<b>&') && !t.includes('Panjangs'))
  assert.equal(renderNudge('pulang', [r('<i>', { maganghub: true })]), 'Masih belum kirim log MagangHub: &lt;i&gt;')
})

test('nudges', () => {
  assert.equal(renderNudge('masuk', rows), 'Masih belum absen masuk Shelia: Bagas, Rina')
  assert.equal(renderNudge('pulang', rows), 'Masih belum kirim log MagangHub: Bagas')
  assert.equal(renderNudge('pulang', [r('A', { maganghub: true, log: true })]), null)
})

test('final', () => {
  assert.match(renderFinal('2026-11-18', rows), /^🏁 <b>Hasil hari ini<\/b> · Rabu 18 Nov\n/)
  assert.match(renderFinal('2026-11-18', rows), /Tidak kirim log: Bagas$/)
  assert.match(renderFinal('2026-11-18', [r('A', { maganghub: true, log: true })]), /Semua sudah kirim log ✅$/)
})

test('libur', () => assert.equal(renderLibur('2026-11-18'), '🏖️ <b>Libur hari ini</b> · Rabu 18 Nov'))
