import { useEffect, useId, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Props {
  page: number
  perPage: number
  /** null = total tidak diketahui: hanya panah, › aktif lewat `hasNext`. */
  total: number | null
  hasNext?: boolean
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
  perPageOptions?: number[]
  ready?: boolean
}

const pageWindow = (page: number, lastPage: number): number[] => {
  // Deviasi dari admin: daftar pendek tampil utuh, bukan "1 2 … 4".
  if (lastPage <= 7) return Array.from({ length: lastPage }, (_, i) => i + 1)
  const window = new Set<number>([1, lastPage, page - 1, page, page + 1])
  return [...window].filter((p) => p >= 1 && p <= lastPage).sort((a, b) => a - b)
}

// Lompat halaman, muncul hanya saat deretan nomor terputus oleh "…".
const PageJump = ({ page, lastPage, onPageChange }: { page: number; lastPage: number; onPageChange: (page: number) => void }) => {
  const inputId = useId()
  const [draft, setDraft] = useState(String(page))
  useEffect(() => { setDraft(String(page)) }, [page])

  const commit = () => {
    const parsed = Number.parseInt(draft, 10)
    if (Number.isNaN(parsed)) {
      setDraft(String(page))
      return
    }
    const next = Math.min(Math.max(parsed, 1), lastPage)
    setDraft(String(next))
    if (next !== page) onPageChange(next)
  }

  return (
    // Tersembunyi di bawah `sm`, sama seperti deret nomornya.
    <div className="mr-1 hidden items-center gap-1.5 sm:flex">
      <label htmlFor={inputId} className="whitespace-nowrap text-[13px] text-muted-foreground">Ke halaman</label>
      <Input
        id={inputId}
        inputMode="numeric"
        autoComplete="off"
        value={draft}
        aria-label={`Ke halaman, 1 sampai ${lastPage}`}
        className="h-9 w-12 px-1 text-center tabular-nums"
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') setDraft(String(page))
        }}
        onBlur={commit}
      />
      <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">dari {lastPage}</span>
    </div>
  )
}

export const ListPagination = ({
  page, perPage, total, hasNext, onPageChange, onPerPageChange, perPageOptions = [10, 25, 50], ready = true,
}: Props) => {
  const known = total !== null
  const lastPage = known ? Math.max(1, Math.ceil(total / Math.max(1, perPage))) : page
  // Halaman di luar jangkauan (mis. data menyusut) dijepit, hanya saat data siap.
  const shown = known ? Math.min(page, lastPage) : page
  const from = known && total === 0 ? 0 : (shown - 1) * perPage + 1
  const to = known ? Math.min(total, shown * perPage) : 0
  const pages = known ? pageWindow(shown, lastPage) : []
  const hasGap = pages.some((p, i) => i > 0 && pages[i - 1] !== p - 1)

  useEffect(() => {
    if (ready && known && total > 0 && page > lastPage) onPageChange(lastPage)
  }, [ready, known, total, page, lastPage, onPageChange])

  return (
    // Kaki kartu p-4: menembus padding supaya garis atasnya selebar kartu.
    <div className="-mx-4 -mb-4 mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        {onPerPageChange && (
          <Select value={String(perPage)} onValueChange={(v) => onPerPageChange(Number(v))}>
            <SelectTrigger className="h-8 w-[72px]" aria-label="Baris per halaman"><SelectValue /></SelectTrigger>
            <SelectContent>
              {perPageOptions.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {known && (
          <span className={cn('tabular-nums', !ready && total === 0 && 'invisible')}>{from}-{to} dari {total}</span>
        )}
      </div>

      <nav aria-label="Halaman" className="flex flex-wrap items-center gap-1">
        {hasGap && <PageJump page={shown} lastPage={lastPage} onPageChange={onPageChange} />}
        <Button variant="ghost" size="icon" className="size-9" aria-label="Halaman sebelumnya" disabled={shown <= 1} onClick={() => onPageChange(shown - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        {/* Nomor halaman mulai `sm:`; panah tidak pernah disembunyikan. */}
        {pages.map((p, i) => (
          <span key={p} className="hidden items-center sm:flex">
            {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1.5 text-muted-foreground" aria-hidden>…</span>}
            <Button
              variant={p === shown ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-auto min-w-9 px-2 tabular-nums"
              aria-current={p === shown ? 'page' : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          </span>
        ))}
        <Button
          variant="ghost" size="icon" className="size-9" aria-label="Halaman berikutnya"
          disabled={known ? shown >= lastPage : !hasNext}
          onClick={() => onPageChange(shown + 1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </nav>
    </div>
  )
}
