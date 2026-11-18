import { createServer } from 'node:http'
import { createVerifier } from './access.ts'
import { createRunner } from './runner.ts'
import { createHandler } from './server.ts'
import { openStore } from './store.ts'
import { createTelegram } from './telegram.ts'

// Settings come only from /home/Documents/phoenix/reminder.env on the VPS (see README.md). Values are never logged.
const NAMES = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ACCESS_TEAM', 'ACCESS_AUD', 'ADMIN_EMAILS'] as const
const env = Object.fromEntries(NAMES.map((n) => [n, process.env[n]?.trim() ?? '']))
const missing = NAMES.filter((n) => !env[n])
if (missing.length) { console.error(`reminder: missing ${missing.join(', ')} in reminder.env`); process.exit(1) }

const store = openStore(process.env.REMINDER_DB ?? '/data/reminder.db')
const tg = createTelegram({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID })
const runner = createRunner({ store, tg })
const verify = createVerifier({ team: env.ACCESS_TEAM, aud: env.ACCESS_AUD })
const handler = createHandler({ store, verify, runner, admins: env.ADMIN_EMAILS.split(',') })

setInterval(() => void runner.tick(), 250) // 250 ms so the 23:59:59 final can never be skipped by timer drift
createServer(handler).listen(8080, () => console.log('reminder: listening on 8080'))
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { store.close(); process.exit(0) })
