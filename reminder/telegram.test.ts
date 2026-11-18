import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTelegram } from './telegram.ts'

const TOKEN = '123:SECRET'
type Reply = Response | Error
function setup(replies: Reply[]) {
  const calls: { url: string; body: any }[] = []
  const sleeps: number[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) })
    const r = replies.shift() ?? new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))
    if (r instanceof Error) throw r
    return r
  }) as typeof globalThis.fetch
  const tg = createTelegram({ token: TOKEN, chatId: '-100', fetch, sleep: async (ms) => { sleeps.push(ms) } })
  return { tg, calls, sleeps }
}
const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }))
const err = (status: number, description: string, parameters?: object) => new Response(JSON.stringify({ ok: false, error_code: status, description, parameters }), { status })

test('send posts HTML to the chat and returns the message id', async () => {
  const { tg, calls } = setup([ok({ message_id: 77 })])
  assert.equal(await tg.send('<b>x</b>', true), 77)
  assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`)
  assert.deepEqual(calls[0].body, { chat_id: '-100', text: '<b>x</b>', parse_mode: 'HTML', link_preview_options: { is_disabled: true }, disable_notification: true })
})

test('edit uses editMessageText', async () => {
  const { tg, calls } = setup([ok(true)])
  assert.equal(await tg.edit(5, 'y'), true)
  assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/editMessageText`)
  assert.deepEqual(calls[0].body, { chat_id: '-100', message_id: 5, text: 'y', parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
})

test('429 waits retry_after seconds then succeeds', async () => {
  const { tg, sleeps } = setup([err(429, 'Too Many Requests', { retry_after: 3 }), ok({ message_id: 9 })])
  assert.equal(await tg.send('x', false), 9)
  assert.deepEqual(sleeps, [3000])
})

test('network errors and 5xx back off 1, 2, 4 s then give up without throwing', async () => {
  const { tg, sleeps, calls } = setup([new Error('ECONNRESET'), err(502, 'Bad Gateway'), new Error('x'), new Error('x')])
  assert.equal(await tg.send('x', false), null)
  assert.deepEqual(sleeps, [1000, 2000, 4000])
  assert.equal(calls.length, 4)
})

test('"message is not modified" counts as success; other 400s fail at once', async () => {
  const a = setup([err(400, 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same')])
  assert.equal(await a.tg.edit(1, 'x'), true)
  const b = setup([err(400, "Bad Request: can't parse entities")])
  assert.equal(await b.tg.send('x', false), null)
  assert.equal(b.calls.length, 1)
})

test('logs never contain the token', async () => {
  const lines: string[] = []
  const orig = console.error
  console.error = (...a: unknown[]) => { lines.push(a.map(String).join(' ')) }
  try {
    const { tg } = setup([new Error(`fetch failed for https://api.telegram.org/bot${TOKEN}/sendMessage`), err(400, 'Bad Request: chat not found')])
    await tg.send('x', false)
  } finally { console.error = orig }
  assert.ok(lines.length > 0)
  assert.ok(lines.every((l) => !l.includes('SECRET')))
})
