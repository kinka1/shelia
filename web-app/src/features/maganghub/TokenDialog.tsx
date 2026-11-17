import { useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { bookmarkletHref } from '@/lib/maganghub'

const MH_URL = 'https://monev.maganghub.kemnaker.go.id/'
const STEPS = [
  'Seret tombol ke bookmark bar',
  <>Buka <a href={MH_URL} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); window.open(MH_URL, '_blank', 'noopener') }} className="font-medium text-primary-ink underline underline-offset-2">MagangHub</a> dan login</>,
  'Klik bookmark → Shelia',
]

export function TokenDialog({ connected, onDisconnect }: { connected: boolean; onDisconnect: () => void }) {
  // React 19 swaps javascript: hrefs set as props for a throwing URL, so set it on the node.
  const bookmarkRef = useCallback((el: HTMLAnchorElement | null) => el?.setAttribute('href', bookmarkletHref(location.origin)), [])
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm" className="h-6 rounded-md px-2 text-xs font-semibold">Perbarui token</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hubungkan MagangHub</DialogTitle>
          <DialogDescription>Token dikirim lewat bookmark, tidak lewat server.</DialogDescription>
        </DialogHeader>
        <a
          ref={bookmarkRef}
          onClick={(e) => { e.preventDefault(); toast('Seret tombol ini ke bookmark bar') }}
          className="inline-flex w-fit rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          → Shelia
        </a>
        <ol className="list-decimal space-y-1 pl-5 text-sm">{STEPS.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {connected && <Button variant="ghost" className="w-fit text-destructive-ink" onClick={onDisconnect}>Putuskan</Button>}
      </DialogContent>
    </Dialog>
  )
}
