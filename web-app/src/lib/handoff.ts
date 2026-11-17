// A bookmark sends the MagangHub tab back to our site; that tab closes itself if another Shelia tab
// is open to take over (it answers 'pong'), otherwise it just stays as a normal Shelia tab.
const ch = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('shelia')
ch?.addEventListener('message', (e) => { if (e.data === 'ping') ch.postMessage('pong') })

export function closeIfAnotherTab(msg?: 'sent'): void {
  if (!ch) return
  const h = (e: MessageEvent) => { if (e.data === 'pong') { ch.removeEventListener('message', h); window.close() } }
  ch.addEventListener('message', h)
  if (msg) ch.postMessage(msg)
  ch.postMessage('ping')
}

export function onLogSent(fn: () => void): () => void {
  const h = (e: MessageEvent) => { if (e.data === 'sent') fn() }
  ch?.addEventListener('message', h)
  return () => ch?.removeEventListener('message', h)
}
