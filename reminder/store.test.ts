import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from './store.ts'

const D = '2026-11-18'

test('patchPerson creates and merges; only given fields change', () => {
  const s = openStore(':memory:')
  s.patchPerson('bagas@x.id', { shelia: true, sheliaName: 'Bagas Gunawan' })
  s.patchPerson('bagas@x.id', { maganghub: true })
  assert.deepEqual(s.getPerson('bagas@x.id'), { email: 'bagas@x.id', nick: null, sheliaName: 'Bagas Gunawan', shelia: true, maganghub: true })
  s.patchPerson('bagas@x.id', { shelia: false })
  assert.equal(s.getPerson('bagas@x.id')!.maganghub, true)
  assert.equal(s.getPerson('nobody@x.id'), null)
})

test('markDone only moves forward', () => {
  const s = openStore(':memory:')
  s.patchPerson('a@x.id', { shelia: true })
  s.markDone('a@x.id', D, { masuk: true })
  s.markDone('a@x.id', D, { masuk: false, pulang: false })
  assert.equal(s.roster(D)[0].masuk, true)
  assert.equal(s.roster(D)[0].pulang, false)
  assert.equal(s.roster('2026-11-19')[0].masuk, false) // per day
})

test('roster skips people with no platform but keeps their flags for when they return', () => {
  const s = openStore(':memory:')
  s.patchPerson('a@x.id', { maganghub: true })
  s.markDone('a@x.id', D, { log: true })
  s.patchPerson('a@x.id', { maganghub: false })
  assert.deepEqual(s.roster(D), [])
  s.patchPerson('a@x.id', { maganghub: true })
  assert.equal(s.roster(D)[0].log, true)
})

test('display name: nick, then Shelia first name, then email local part; ordered by name', () => {
  const s = openStore(':memory:')
  s.patchPerson('z@x.id', { shelia: true, sheliaName: 'Bagas Gunawan' })
  s.patchPerson('rina@x.id', { maganghub: true })
  s.patchPerson('d@x.id', { shelia: true, sheliaName: 'Dimas P', nick: 'Adi' })
  assert.deepEqual(s.roster(D).map((r) => [r.email, r.name]), [['d@x.id', 'Adi'], ['z@x.id', 'Bagas'], ['rina@x.id', 'rina']])
  s.patchPerson('d@x.id', { nick: null })
  assert.equal(s.roster(D).find((r) => r.email === 'd@x.id')!.name, 'Dimas')
})

test('fired, messages and holidays round-trip', () => {
  const s = openStore(':memory:')
  assert.equal(s.fired(D, 'masuk-table'), false)
  s.markFired(D, 'masuk-table'); s.markFired(D, 'masuk-table')
  assert.equal(s.fired(D, 'masuk-table'), true)
  assert.equal(s.getMessage(D, 'masuk'), null)
  s.setMessage(D, 'masuk', 42)
  assert.equal(s.getMessage(D, 'masuk'), 42)
  assert.equal(s.getMessage(D, 'pulang'), null)
  s.setHoliday(D, true); assert.equal(s.isHoliday(D), true)
  s.setHoliday(D, false); assert.equal(s.isHoliday(D), false)
})

test('a reopened file keeps everything', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-'))
  try {
    const f = join(dir, 'r.db')
    const a = openStore(f)
    a.patchPerson('a@x.id', { shelia: true }); a.markDone('a@x.id', D, { masuk: true }); a.markFired(D, 'final'); a.setMessage(D, 'pulang', 7); a.setHoliday(D, true)
    a.close()
    const b = openStore(f)
    assert.equal(b.roster(D)[0].masuk, true)
    assert.equal(b.fired(D, 'final'), true)
    assert.equal(b.getMessage(D, 'pulang'), 7)
    assert.equal(b.isHoliday(D), true)
    b.close()
  } finally { rmSync(dir, { recursive: true }) }
})
