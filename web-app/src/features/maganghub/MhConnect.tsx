import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { setMhToken } from '@/lib/maganghub'
import { EXT_ZIP, extError, extToken } from '@/lib/extension'

const SMALL = 'h-6 rounded-md px-2 text-xs font-semibold'
const LINK = 'font-medium text-primary-ink underline underline-offset-2'

/** Perbarui token through the extension in one click; without it, how to install it. */
export function MhConnect({ installed, onRefresh }: { installed: boolean; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function refresh() {
    setBusy(true); setErr('')
    const r = await extToken(true)
    setBusy(false)
    if ('ok' in r && r.ok && r.token) { setMhToken(r.token); onRefresh(); toast.success('Token MagangHub diperbarui'); return }
    setErr(extError(r))
  }

  if (installed) return (
    <span className="inline-flex items-center gap-2">
      {err && <span role="alert" className="text-xs text-destructive-ink">{err}</span>}
      <Button variant="outline" size="sm" className={SMALL} disabled={busy} onClick={() => void refresh()}>
        {busy ? 'Memperbarui…' : 'Perbarui token'}
      </Button>
    </span>
  )

  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm" className={SMALL}>Pasang ekstensi</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pasang ekstensi Shelia MagangHub</DialogTitle>
          <DialogDescription>Token dan log harian dikirim lewat situs MagangHub di browser Anda, dengan satu klik. Hanya untuk Chrome.</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li><a href={EXT_ZIP} download className={LINK}>Unduh ekstensi</a>, lalu ekstrak.</li>
          <li>
            Buka <code className="rounded bg-muted px-1">chrome://extensions</code>{' '}
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs"
              onClick={() => void navigator.clipboard?.writeText('chrome://extensions').then(() => toast('Disalin. Tempel di address bar.'))}>Salin</Button>
          </li>
          <li>Nyalakan <b>Developer mode</b>, klik <b>Load unpacked</b>, pilih folder hasil ekstrak.</li>
        </ol>
        <p className="text-xs text-muted-foreground">Halaman ini dimuat ulang otomatis setelah ekstensi terpasang.</p>
      </DialogContent>
    </Dialog>
  )
}
