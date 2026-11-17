import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { StatusPill } from '@/features/shelia/Sessions'
import type { MhLog } from '@/lib/maganghub'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const fmtDate = (d?: string) => {
  if (typeof d !== 'string') return '-'
  const [y, m, day] = d.split('-')
  return MONTHS[Number(m) - 1] ? `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}` : d
}

// StatusPill memakai kunci status sesi; dipetakan ke tint yang sama.
const STATUS: Record<string, [string, string]> = {
  PRESENT: ['closed', 'Hadir'],
  PERMIT: ['late', 'Izin'],
  SICK: ['late', 'Sakit'],
  ABSENT: ['rejected', 'Tidak hadir'],
}
export const MhStatusPill = ({ status }: { status?: string }) => {
  const [key, label] = STATUS[status ?? ''] ?? ['', status || '-']
  return <StatusPill status={key} label={label} />
}

interface Props {
  rows: MhLog[]
  index: number | null
  onIndexChange: (i: number) => void
  onClose: () => void
  /** Baris pemicu; fokus dikembalikan ke sini saat sheet tertutup. */
  returnFocus: () => HTMLElement | null
}

export function LogDetailSheet({ rows, index, onIndexChange, onClose, returnFocus }: Props) {
  const row = index === null ? undefined : rows[index]
  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        className="flex w-full flex-col overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus()?.focus() }}
      >
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{fmtDate(row.date)}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <span className="tabular-nums">Masuk {row.clock_in || '-'}</span>
                <MhStatusPill status={row.status} />
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-4">
              {([['Aktivitas', row.activity_log], ['Pembelajaran', row.lesson_learned], ['Kendala', row.obstacles]] as const).map(([label, text]) => (
                <section key={label}>
                  <h3 className="text-sm font-medium">{label}</h3>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{text || '-'}</p>
                </section>
              ))}
            </div>
            <SheetFooter className="gap-2">
              <Button variant="outline" className="h-9" disabled={index === 0} onClick={() => onIndexChange(index! - 1)}>
                <ChevronLeft className="size-4" aria-hidden /> Sebelumnya
              </Button>
              <Button variant="outline" className="h-9" disabled={index === rows.length - 1} onClick={() => onIndexChange(index! + 1)}>
                Berikutnya <ChevronRight className="size-4" aria-hidden />
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
