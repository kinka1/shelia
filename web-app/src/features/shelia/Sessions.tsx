import { AlertTriangle, CheckCircle2, Circle, Clock, PlayCircle, XCircle } from 'lucide-react'
import { fmtTime } from '@/lib/attendance'

const TONE: Record<string, [string, typeof Circle]> = {
  not_checked_in: ['bg-warning/15 text-warning-ink', AlertTriangle],
  late: ['bg-warning/15 text-warning-ink', AlertTriangle],
  expired: ['bg-warning/15 text-warning-ink', AlertTriangle],
  rejected: ['bg-destructive/10 text-destructive-ink', XCircle],
  checked_in: ['bg-success/10 text-success-ink', CheckCircle2],
  closed: ['bg-success/10 text-success-ink', CheckCircle2],
  open: ['bg-primary/10 text-primary-ink', PlayCircle],
  on_break: ['bg-primary/10 text-primary-ink', Clock],
}

// Status = label + ikon + tint, tidak pernah warna saja.
export function StatusPill({ status, label }: { status?: string; label: string }) {
  const [cls, Icon] = TONE[status || ''] ?? ['bg-muted text-muted-foreground', Circle]
  return (
    <span className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${cls}`}>
      <Icon className="size-3" /> {label}
    </span>
  )
}

/** What the status card at the top doesn't say: the check-out window and an HR review. No box. */
export function SessionNotes({ sessions }: { sessions: any[] }) {
  const s = sessions[sessions.length - 1]
  if (!s) return null
  const window_ = s.state === 'open' && s.shift?.check_out_start_at
  if (!window_ && !s.needs_hr_review) return null
  return (
    <div className="space-y-1 text-[13px]">
      {window_ && (
        <p className="text-muted-foreground">
          Check-out mulai {fmtTime(s.shift.check_out_start_at, s.work_date)} sampai {fmtTime(s.shift.check_out_end_at, s.work_date)}
        </p>
      )}
      {s.needs_hr_review && (
        <p className="text-warning-ink">Menunggu pemeriksaan HR{s.hr_review_status ? ` (${s.hr_review_status})` : ''}</p>
      )}
    </div>
  )
}
