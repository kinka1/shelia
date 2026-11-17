import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { bookmarkletHref, setMhToken } from '@/lib/maganghub'
import { EXT_ZIP, extError, extToken, useExtension } from '@/lib/extension'

const MH_URL = 'https://monev.maganghub.kemnaker.go.id/'
const LINK = 'font-medium text-primary-ink underline underline-offset-2'
const STEPS = [
  'Seret tombol ke bookmark bar',
  <>Buka <a href={MH_URL} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); window.open(MH_URL, '_blank', 'noopener') }} className={LINK}>MagangHub</a> dan login</>,
  'Klik bookmark → Shelia',
]

export function TokenDialog({ token, connected, onDisconnect, onRefresh }: {
  token?: string | null; connected: boolean; onDisconnect: () => void; onRefresh?: () => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [token]) // new token arrived: done here
  const ext = useExtension()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // React 19 swaps javascript: hrefs set as props for a throwing URL, so set it on the node.
  const bookmarkRef = useCallback((el: HTMLAnchorElement | null) => el?.setAttribute('href', bookmarkletHref(location.origin)), [])

  async function fetchToken() {
    setBusy(true); setErr('')
    const r = await extToken(true)
    setBusy(false)
    if ('ok' in r && r.ok && r.token) { setMhToken(r.token); onRefresh?.(); return }
    setErr(extError(r))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setErr(''); void ext.recheck() } }}>
      <DialogTrigger asChild><Button variant="outline" size="sm" className="h-6 rounded-md px-2 text-xs font-semibold">Perbarui token</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hubungkan MagangHub</DialogTitle>
          <DialogDescription>Token diambil dari situs MagangHub di browser Anda, tidak lewat server.</DialogDescription>
        </DialogHeader>
        {ext.version ? (<>
          <p className="text-sm text-success-ink">Ekstensi terpasang (v{ext.version})</p>
          <Button className="w-fit" disabled={busy} onClick={() => void fetchToken()}>{busy ? 'Mengambil…' : 'Ambil token'}</Button>
          {busy && <p className="text-xs text-muted-foreground">Kalau MagangHub meminta login, login di tab yang terbuka. Token diambil otomatis setelahnya.</p>}
          {err && <p role="alert" className="text-sm text-destructive-ink">{err}</p>}
        </>) : (<>
          <a ref={bookmarkRef}
            onClick={(e) => { e.preventDefault(); toast('Seret tombol ini ke bookmark bar') }}
            className="inline-flex w-fit rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            → Shelia
          </a>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{STEPS.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <section className="space-y-1.5 rounded-md border p-3 text-sm">
            <p className="font-medium">Ekstensi belum terpasang</p>
            <p className="text-xs text-muted-foreground">Dengan ekstensi Chrome, token dan log terkirim dengan satu klik, tanpa bookmark.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li><a href={EXT_ZIP} download className={LINK}>Unduh ekstensi</a>, lalu ekstrak.</li>
              <li>
                Buka <code className="rounded bg-muted px-1">chrome://extensions</code>{' '}
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => void navigator.clipboard?.writeText('chrome://extensions').then(() => toast('Disalin. Tempel di address bar.'))}>Salin</Button>
              </li>
              <li>Nyalakan <b>Developer mode</b>, klik <b>Load unpacked</b>, pilih folder hasil ekstrak.</li>
            </ol>
            <Button variant="outline" size="sm" onClick={() => void ext.recheck().then((v) => { if (!v) toast('Ekstensi belum terdeteksi') })}>Cek lagi</Button>
          </section>
        </>)}
        {connected && <Button variant="ghost" className="w-fit text-destructive-ink" onClick={onDisconnect}>Putuskan</Button>}
      </DialogContent>
    </Dialog>
  )
}
