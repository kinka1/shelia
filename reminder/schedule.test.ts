import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENTS, TABLE_CLOSE, wib } from './schedule.ts'

test('wib converts to Jakarta wall clock', () => {
  assert.deepEqual(wib(new Date('2026-11-18T00:45:00Z')), { date: '2026-11-18', time: '07:45:00', weekday: true })
  assert.equal(wib(new Date('2026-11-21T01:00:00Z')).weekday, false) // Saturday
  assert.equal(wib(new Date('2026-11-22T01:00:00Z')).weekday, false) // Sunday
  assert.equal(wib(new Date('2026-11-18T17:30:00Z')).date, '2026-11-19') // 00:30 WIB next day
})

test('EVENTS match the agreed schedule', () => {
  assert.deepEqual(EVENTS.map((e) => `${e.at} ${e.kind} ${e.slot} ${e.silent ? '🔕' : '🔔'}`), [
    '07:45:00 table masuk 🔔', '07:55:00 nudge masuk 🔔', '08:00:00 nudge masuk 🔔',
    '16:45:00 table pulang 🔔', '17:30:00 nudge pulang 🔔', '20:00:00 nudge pulang 🔔',
    '22:00:00 nudge pulang 🔔', '23:00:00 nudge pulang 🔔', '23:30:00 nudge pulang 🔕', '23:59:59 final pulang 🔕'])
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length)
  assert.deepEqual(TABLE_CLOSE, { masuk: '16:45:00', pulang: '23:59:59' })
})
