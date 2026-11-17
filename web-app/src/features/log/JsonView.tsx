import { Copy } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { HIDDEN } from '@/lib/redact'

const PAD = (n: number) => '  '.repeat(n)

function node(v: unknown, d: number): ReactNode {
  if (v === HIDDEN) return <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{HIDDEN}</span>
  if (typeof v === 'string') return <span className="text-success-ink">{JSON.stringify(v)}</span>
  if (typeof v === 'number') return <span className="text-warning-ink">{v}</span>
  if (v === null || typeof v === 'boolean') return <span className="text-primary-ink">{String(v)}</span>
  const arr = Array.isArray(v)
  const items = arr ? v.map((x) => [null, x] as const) : Object.entries(v as object)
  if (!items.length) return arr ? '[]' : '{}'
  return (
    <>
      {arr ? '[' : '{'}
      {items.map(([k, x], i) => (
        <span key={i}>
          {'\n'}{PAD(d + 1)}
          {k !== null && <><span className="text-primary-ink">{JSON.stringify(k)}</span>{': '}</>}
          {node(x, d + 1)}{i < items.length - 1 && ','}
        </span>
      ))}
      {'\n'}{PAD(d)}{arr ? ']' : '}'}
    </>
  )
}

export function JsonView({ value }: { value: unknown }) {
  const copy = () => {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    navigator.clipboard.writeText(text).then(() => toast.success('Tersalin'), () => toast.error('Gagal menyalin'))
  }
  return (
    <div className="relative">
      <Button type="button" variant="outline" size="sm" className="absolute right-2 top-2" onClick={copy}>
        <Copy className="size-3.5" /> Salin
      </Button>
      <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 pr-20 font-mono text-xs leading-relaxed">
        {value === null || value === '' || value === undefined ? <span className="text-muted-foreground">Kosong</span> : typeof value === 'string' ? value : node(value, 0)}
      </pre>
    </div>
  )
}
