import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { setMhToken } from '@/lib/maganghub'
import { EXT_ZIP, extError, extToken } from '@/lib/extension'

const SMALL = 'h-6 rounded-md px-2 text-xs font-semibold'
const LINK = 'font-medium text-primary-ink underline underline-offset-2'

/** Ask the extension for a MagangHub token (bringing MagangHub's login forward if needed). */
function useTokenRefresh(onRefresh: () => void) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function refresh() {
    setBusy(true); setErr('')
    const r = await extToken(true)
    setBusy(false)
    if ('ok' in r && r.ok && r.token) { setMhToken(r.token); onRefresh(); toast.success('MagangHub terhubung'); return }
    setErr(extError(r))
  }
  return { busy, err, refresh }
}

function InstallSteps() {
  return (<>
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      <li><a href={EXT_ZIP} download className={LINK}>Unduh ekstensi</a>, lalu ekstrak.</li>
      <li>
        Buka <code className="rounded bg-muted px-1">chrome://extensions</code>{' '}
        <Button variant="outline" size="sm" className="h-6 px-2 text-xs"
          onClick={() => void navigator.clipboard?.writeText('chrome://extensions').then(() => toast('Disalin. Tempel di address bar.'))}>Salin</Button>
      </li>
      <li>Nyalakan <b>Developer mode</b>, klik <b>Load unpacked</b>, pilih folder hasil ekstrak.</li>
    </ol>
    <p className="text-xs text-muted-foreground">
      Halaman ini dimuat ulang otomatis setelah ekstensi terpasang. Baru menyalakan lagi ekstensi yang dimatikan?{' '}
      <button type="button" className={LINK} onClick={() => location.reload()}>Muat ulang halaman</button>
    </p>
  </>)
}

/** Header button: Perbarui token in one click with the extension; otherwise how to install it. */
export function MhConnect({ installed, onRefresh, onBusy }: { installed: boolean; onRefresh: () => void; onBusy?: (busy: boolean) => void }) {
  const { busy, err, refresh } = useTokenRefresh(onRefresh)
  useEffect(() => { onBusy?.(busy) }, [busy, onBusy])

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
          <DialogTitle>Pasang ekstensi Phoenix MagangHub</DialogTitle>
          <DialogDescription>Token dan log harian dikirim lewat situs MagangHub di browser Anda, dengan satu klik. Hanya untuk Chrome.</DialogDescription>
        </DialogHeader>
        <InstallSteps />
      </DialogContent>
    </Dialog>
  )
}

/** In place of the form until MagangHub is connected, like the Shelia card's login. */
export function MhConnectPanel({ installed, expired, onRefresh }: { installed: boolean; expired: boolean; onRefresh: () => void }) {
  const { busy, err, refresh } = useTokenRefresh(onRefresh)
  if (!installed) return (
    <div className="mt-3 max-w-sm space-y-2">
      <h3 className="text-[15px] font-semibold">Pasang ekstensi dulu</h3>
      <p className="text-[13px] text-muted-foreground">Ekstensi Chrome mengambil token dan mengirim log lewat situs MagangHub di browser Anda.</p>
      <InstallSteps />
    </div>
  )
  return (
    <div className="mt-3 max-w-sm space-y-3">
      <h3 className="text-[15px] font-semibold">{expired ? 'Token MagangHub kedaluwarsa' : 'Hubungkan MagangHub'}</h3>
      <p className="text-[13px] text-muted-foreground">Token diambil dari situs MagangHub. Kalau diminta login, login di tab MagangHub yang terbuka.</p>
      {err && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive-ink">{err}</p>}
      <Button className="w-full" disabled={busy} onClick={() => void refresh()}>{busy ? 'Menghubungkan…' : 'Hubungkan MagangHub'}</Button>
    </div>
  )
}
