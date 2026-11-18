import type { IncomingMessage, ServerResponse } from 'node:http'
import { nameOf, type Store } from './store.ts'
import { wib } from './schedule.ts'

type Runner = { changed(date: string): void; holidayChanged(date: string): Promise<void> }
const LIMIT = 4096
const DATE = /^\d{4}-\d{2}-\d{2}$/

class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status } }

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > LIMIT) throw new HttpError(413, 'too large')
    chunks.push(c as Buffer)
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    if (v && typeof v === 'object' && !Array.isArray(v)) return v
  } catch { /* fall through */ }
  throw new HttpError(400, 'bad json')
}

const optBool = (b: Record<string, unknown>, k: string) => {
  if (b[k] !== undefined && typeof b[k] !== 'boolean') throw new HttpError(400, `${k} must be boolean`)
  return b[k] as boolean | undefined
}

export function createHandler(o: { store: Store; verify: (jwt?: string) => Promise<string | null>; runner: Runner; admins: string[]; invite?: string | null; now?: () => Date }) {
  const { store, runner } = o
  const now = o.now ?? (() => new Date())
  const admins = new Set(o.admins.map((e) => e.trim().toLowerCase()).filter(Boolean))

  async function route(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url ?? '/').split('?')[0]
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, data === undefined ? {} : { 'content-type': typeof data === 'string' ? 'text/plain' : 'application/json' })
      res.end(data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data))
    }
    if (req.method === 'GET' && path === '/health') return send(200, 'ok')

    const h = req.headers['cf-access-jwt-assertion']
    const email = await o.verify(Array.isArray(h) ? h[0] : h)
    if (!email) return send(401, { error: 'unauthorized' })
    const today = wib(now()).date
    const key = `${req.method} ${path}`

    if (key === 'GET /me') {
      const p = store.getPerson(email) ?? { email, sheliaName: null, shelia: false, maganghub: false }
      return send(200, { name: nameOf(p), shelia: p.shelia, maganghub: p.maganghub, admin: admins.has(email), holiday: store.isHoliday(today), invite: o.invite ?? null })
    }
    if (key === 'PUT /me') {
      const b = await body(req)
      const patch: Parameters<Store['patchPerson']>[1] = { shelia: optBool(b, 'shelia'), maganghub: optBool(b, 'maganghub') }
      if (b.sheliaName !== undefined) {
        if (typeof b.sheliaName !== 'string' || b.sheliaName.length > 100) throw new HttpError(400, 'sheliaName')
        patch.sheliaName = b.sheliaName
      }
      store.patchPerson(email, patch)
      runner.changed(today)
      return send(204)
    }
    if (key === 'PUT /me/today') {
      const b = await body(req)
      if (b.date !== today) throw new HttpError(400, 'date must be today (WIB)')
      store.markDone(email, today, { masuk: optBool(b, 'masuk'), pulang: optBool(b, 'pulang'), log: optBool(b, 'log') })
      runner.changed(today)
      return send(204)
    }
    if (key === 'PUT /holiday') {
      if (!admins.has(email)) return send(403, { error: 'admin only' })
      const b = await body(req)
      if (typeof b.date !== 'string' || !DATE.test(b.date) || typeof b.on !== 'boolean') throw new HttpError(400, 'date/on')
      store.setHoliday(b.date, b.on)
      await runner.holidayChanged(b.date)
      return send(204)
    }
    return send(404, { error: 'not found' })
  }

  return (req: IncomingMessage, res: ServerResponse) => {
    route(req, res).catch((e) => {
      const status = e instanceof HttpError ? e.status : 500
      if (status === 500) console.error('reminder request failed:', e instanceof Error ? e.message : e)
      if (!res.headersSent) { res.writeHead(status, { 'content-type': 'application/json', connection: 'close' }); res.end(JSON.stringify({ error: status === 500 ? 'internal' : e.message })) }
    })
  }
}
