import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { openStore } from './store.ts'
import { createHandler } from './server.ts'

const store = openStore(':memory:')
const calls = { changed: [] as string[], holiday: [] as string[] }
const runner = { changed: (d: string) => { calls.changed.push(d) }, holidayChanged: async (d: string) => { calls.holiday.push(d) } }
const verify = async (jwt?: string) => (jwt === 'good' ? 'bagas@x.id' : jwt === 'boss' ? 'boss@x.id' : null)
const now = () => new Date('2026-11-18T03:00:00Z') // 10:00 WIB
const server = createServer(createHandler({ store, verify, runner, admins: ['boss@x.id'], now }))
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
after(() => server.close())

const req = (path: string, o: { method?: string; jwt?: string; body?: unknown; raw?: string } = {}) =>
  fetch(base + path, {
    method: o.method ?? 'GET',
    headers: { ...(o.jwt ? { 'cf-access-jwt-assertion': o.jwt } : {}), 'content-type': 'application/json' },
    body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
  })

test('health needs no auth; everything else does', async () => {
  assert.equal((await req('/health')).status, 200)
  assert.equal(await (await req('/health')).text(), 'ok')
  assert.equal((await req('/me')).status, 401)
  assert.equal((await req('/me', { jwt: 'forged' })).status, 401)
})

test('PUT /me merges, GET /me reflects it', async () => {
  assert.equal((await req('/me', { method: 'PUT', jwt: 'good', body: { shelia: true, sheliaName: 'Bagas Gunawan' } })).status, 204)
  assert.equal((await req('/me', { method: 'PUT', jwt: 'good', body: { maganghub: true, nick: '  Gas ' } })).status, 204)
  const me = await (await req('/me', { jwt: 'good' })).json()
  assert.deepEqual(me, { name: 'Gas', nick: 'Gas', shelia: true, maganghub: true, admin: false, holiday: false })
  assert.equal((await req('/me', { method: 'PUT', jwt: 'good', body: { nick: '' } })).status, 204)
  assert.equal((await (await req('/me', { jwt: 'good' })).json()).name, 'Bagas')
  assert.ok(calls.changed.includes('2026-11-18'))
})

test('GET /me for someone never seen', async () => {
  assert.deepEqual(await (await req('/me', { jwt: 'boss' })).json(), { name: 'boss', nick: null, shelia: false, maganghub: false, admin: true, holiday: false })
})

test('PUT /me/today only for today WIB', async () => {
  assert.equal((await req('/me/today', { method: 'PUT', jwt: 'good', body: { date: '2026-11-17', masuk: true } })).status, 400)
  assert.equal((await req('/me/today', { method: 'PUT', jwt: 'good', body: { date: '2026-11-18', masuk: true } })).status, 204)
  assert.equal(store.roster('2026-11-18').find((r) => r.email === 'bagas@x.id')!.masuk, true)
})

test('PUT /holiday is admin only', async () => {
  assert.equal((await req('/holiday', { method: 'PUT', jwt: 'good', body: { date: '2026-11-18', on: true } })).status, 403)
  assert.equal((await req('/holiday', { method: 'PUT', jwt: 'boss', body: { date: '2026-11-18', on: true } })).status, 204)
  assert.equal(store.isHoliday('2026-11-18'), true)
  assert.deepEqual(calls.holiday, ['2026-11-18'])
  assert.equal((await (await req('/me', { jwt: 'good' })).json()).holiday, true)
})

test('bad input: too big, wrong types, bad JSON, long nick, unknown route', async () => {
  assert.equal((await req('/me', { method: 'PUT', jwt: 'good', raw: JSON.stringify({ nick: 'x'.repeat(5000) }) })).status, 413)
  assert.equal((await req('/me', { method: 'PUT', jwt: 'good', body: { shelia: 'yes' } })).status, 400)
  assert.equal((await req('/me', { method: 'PUT', jwt: 'good', raw: '{nope' })).status, 400)
  assert.equal((await req('/me', { method: 'PUT', jwt: 'good', body: { nick: 'x'.repeat(30) } })).status, 400)
  assert.equal((await req('/me/today', { method: 'PUT', jwt: 'good', body: { date: '2026-11-18', masuk: 1 } })).status, 400)
  assert.equal((await req('/holiday', { method: 'PUT', jwt: 'boss', body: { date: 'tomorrow', on: true } })).status, 400)
  assert.equal((await req('/nope', { jwt: 'good' })).status, 404)
})
