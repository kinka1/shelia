// Telegram channel reminder (phoenix-reminder behind /remind-api/). Same-origin: the Cloudflare Access
// login identifies the person. Never sends tokens. Never throws: a reminder problem must not block attendance.

export type RemindMe = { name: string; nick: string | null; shelia: boolean; maganghub: boolean; admin: boolean; holiday: boolean }

async function put(path: string, body: object): Promise<boolean> {
  try {
    const r = await fetch(`/remind-api${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(String(r.status))
    return true
  } catch (e) {
    console.warn('Pengingat Telegram:', path, e instanceof Error ? e.message : e)
    return false
  }
}

export const remindPlatforms = async (p: { shelia?: boolean; maganghub?: boolean; sheliaName?: string }): Promise<void> => { await put('/me', p) }

export async function remindToday(date: string, f: { masuk?: boolean; pulang?: boolean; log?: boolean }): Promise<void> {
  if (!f.masuk && !f.pulang && !f.log) return
  await put('/me/today', { date, ...f })
}

export async function remindMe(): Promise<RemindMe | null> {
  try {
    const r = await fetch('/remind-api/me')
    if (!r.ok) throw new Error(String(r.status))
    return (await r.json()) as RemindMe
  } catch (e) {
    console.warn('Pengingat Telegram: /me', e instanceof Error ? e.message : e)
    return null
  }
}

export const remindNick = (nick: string | null) => put('/me', { nick })
export const remindHoliday = (date: string, on: boolean) => put('/holiday', { date, on })
