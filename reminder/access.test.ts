import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { createVerifier } from './access.ts'

const AUD = 'aud-123'
const NOW = 1_800_000_000_000
const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...key.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

function sign(claims: object, o: { kid?: string; alg?: string; priv?: typeof key.privateKey } = {}) {
  const head = b64({ alg: o.alg ?? 'RS256', kid: o.kid ?? 'k1' }) + '.' + b64(claims)
  if (o.alg === 'none') return head + '.'
  return head + '.' + createSign('RSA-SHA256').update(head).sign(o.priv ?? key.privateKey).toString('base64url')
}
const good = (extra = {}) => ({ aud: [AUD], email: 'Bagas@X.id', exp: NOW / 1000 + 600, ...extra })

function setup() {
  const calls: string[] = []
  const fetch = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify({ keys: [jwk] })) }) as typeof globalThis.fetch
  return { calls, verify: createVerifier({ team: 'team', aud: AUD, fetch, now: () => NOW }) }
}

test('valid token gives the lower-cased email; certs from the team URL', async () => {
  const { verify, calls } = setup()
  assert.equal(await verify(sign(good())), 'bagas@x.id')
  assert.equal(await verify(sign(good({ aud: AUD }))), 'bagas@x.id') // aud as a string
  assert.deepEqual(calls, ['https://team.cloudflareaccess.com/cdn-cgi/access/certs']) // cached
})

test('rejects wrong aud, expired, bad signature, alg none, garbage, missing', async () => {
  const { verify } = setup()
  assert.equal(await verify(sign(good({ aud: ['other'] }))), null)
  assert.equal(await verify(sign(good({ exp: NOW / 1000 - 1 }))), null)
  assert.equal(await verify(sign(good(), { priv: other.privateKey })), null)
  assert.equal(await verify(sign(good(), { alg: 'none' })), null)
  assert.equal(await verify('not.a.jwt'), null)
  assert.equal(await verify('garbage'), null)
  assert.equal(await verify(undefined), null)
  assert.equal(await verify(sign({ aud: [AUD], exp: NOW / 1000 + 600 })), null) // no email
})

test('an unknown kid refetches the certs, at most once a minute', async () => {
  let t = NOW
  const calls: string[] = []
  const fetch = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify({ keys: [jwk] })) }) as typeof globalThis.fetch
  const verify = createVerifier({ team: 'team', aud: AUD, fetch, now: () => t })
  await verify(sign(good()))
  assert.equal(await verify(sign(good(), { kid: 'k2' })), null)
  assert.equal(calls.length, 1) // same minute: no refetch
  t += 61_000
  assert.equal(await verify(sign(good({ exp: t / 1000 + 600 }), { kid: 'k2' })), null)
  assert.equal(calls.length, 2)
  assert.equal(await verify(sign(good({ exp: t / 1000 + 600 }), { kid: 'k3' })), null)
  assert.equal(calls.length, 2)
})

test('concurrent first requests all wait for the same certs fetch', async () => {
  const { verify, calls } = setup()
  const out = await Promise.all([verify(sign(good())), verify(sign(good())), verify(sign(good()))])
  assert.deepEqual(out, ['bagas@x.id', 'bagas@x.id', 'bagas@x.id'])
  assert.equal(calls.length, 1)
})

test('a hanging certs endpoint times out instead of stalling requests', async () => {
  const fetch = ((_u: string, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as typeof globalThis.fetch
  const verify = createVerifier({ team: 'team', aud: AUD, fetch, now: () => NOW, timeoutMs: 20 })
  assert.equal(await verify(sign(good())), null)
})
