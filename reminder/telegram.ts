export type Telegram = ReturnType<typeof createTelegram>

/** Minimal Telegram Bot API client. Never throws; never logs the bot token. */
export function createTelegram(o: { token: string; chatId: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }) {
  const get = o.fetch ?? fetch
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const hide = (s: string) => s.split(o.token).join('<token>')

  async function call(method: string, body: object): Promise<{ ok: true; result: any } | { ok: false; description: string }> {
    let backoff = 1000
    let last = 'no attempt'
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const r = await get(`https://api.telegram.org/bot${o.token}/${method}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        })
        const j: any = await r.json().catch(() => ({}))
        if (j.ok) return { ok: true, result: j.result }
        last = `${r.status} ${j.description ?? ''}`.trim()
        if (r.status === 429) { if (attempt < 4) await sleep((j.parameters?.retry_after ?? 1) * 1000); continue }
        if (r.status < 500) return { ok: false, description: String(j.description ?? last) } // a 4xx will not get better on retry
      } catch (e) {
        last = e instanceof Error ? e.message : String(e)
      }
      if (attempt < 4) { await sleep(backoff); backoff *= 2 }
    }
    return { ok: false, description: last }
  }

  const base = { chat_id: o.chatId, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
  return {
    async send(html: string, silent: boolean): Promise<number | null> {
      const r = await call('sendMessage', { chat_id: base.chat_id, text: html, parse_mode: base.parse_mode, link_preview_options: base.link_preview_options, disable_notification: silent })
      if (r.ok) return r.result.message_id
      console.error('telegram sendMessage failed:', hide(r.description))
      return null
    },
    async edit(messageId: number, html: string): Promise<boolean> {
      const r = await call('editMessageText', { chat_id: base.chat_id, message_id: messageId, text: html, parse_mode: base.parse_mode, link_preview_options: base.link_preview_options })
      if (r.ok || /message is not modified/.test(r.description)) return true
      console.error('telegram editMessageText failed:', hide(r.description))
      return false
    },
  }
}
