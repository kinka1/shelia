import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { HIDDEN } from '@/lib/redact'

const PAD = (n: number) => '  '.repeat(n)

function node(v: unknown, d: number): ReactNode {
  if (v === HIDDEN) return <span className="rounded bg-code-chip px-1.5 text-code-muted">{HIDDEN}</span>
  if (typeof v === 'string') return <span className="text-code-string">{JSON.stringify(v)}</span>
  if (typeof v === 'number') return <span className="text-code-number">{v}</span>
  if (v === null || typeof v === 'boolean') return <span className="text-code-number">{String(v)}</span>
  const arr = Array.isArray(v)
  const items = arr ? v.map((x) => [null, x] as const) : Object.entries(v as object)
  if (!items.length) return arr ? '[]' : '{}'
  return (
    <>
      {arr ? '[' : '{'}
      {items.map(([k, x], i) => (
        <span key={i}>
          {'\n'}{PAD(d + 1)}
          {k !== null && <><span className="text-code-key">{JSON.stringify(k)}</span>{': '}</>}
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
      <button
        type="button" onClick={copy}
        className="absolute right-2 top-2 rounded-md bg-code-chip px-2.5 py-1 text-xs font-medium text-white hover:bg-code-chip/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        Salin
      </button>
      <pre className="m-0 max-h-96 overflow-auto rounded-lg bg-code px-3.5 py-3 pr-20 font-mono text-[12.5px] leading-[1.6] text-code-foreground">
        {value === null || value === '' || value === undefined ? <span className="text-code-muted">Kosong</span> : typeof value === 'string' ? value : node(value, 0)}
      </pre>
    </div>
  )
}
