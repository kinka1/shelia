import { useState } from 'react'
import { Check, Copy, Send } from 'lucide-react'

/** Sidebar footer: the reminder channel's invite link, to open or copy. */
export function TelegramFooter({ invite }: { invite: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { /* clipboard blocked: the link still opens the channel */ }
  }
  return (
    <div className="mt-auto flex items-center gap-1 border-t border-sidebar-border px-1 pt-3">
      <a href={invite} target="_blank" rel="noopener noreferrer"
        className="flex h-9 flex-1 items-center gap-2 rounded-[8px] px-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-white">
        <Send className="size-4" /> Channel Telegram
      </a>
      <button type="button" onClick={() => void copy()} aria-label="Salin link channel" title={copied ? 'Tersalin' : 'Salin link'}
        className="grid size-9 place-items-center rounded-[8px] transition-colors hover:bg-sidebar-accent hover:text-white">
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}
