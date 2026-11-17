import { AlertTriangle, CheckCircle2, Circle, Clock, PlayCircle, XCircle } from 'lucide-react'
import { STATE_LABEL, fmtTime } from '@/lib/attendance'

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

export function Sessions({ sessions }: { sessions: any[] }) {
  if (!sessions.length) return null
  return (
    <ul className="divide-y rounded-md border">
      {sessions.map((s, i) => (
        <li key={i} className="space-y-1 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <strong>Sesi {s.session_no ?? '-'}{s.shift?.name ? ` · ${s.shift.name}` : ''}</strong>
            <StatusPill status={s.state} label={STATE_LABEL[s.state] || s.state || '-'} />
          </div>
          <div className="text-muted-foreground">
            Masuk {fmtTime(s.check_in_time, s.work_date)} · Pulang {fmtTime(s.check_out_time, s.work_date)}
          </div>
          {s.state === 'open' && s.shift?.check_out_start_at && (
            <div className="text-muted-foreground">
              Check-out mulai {fmtTime(s.shift.check_out_start_at, s.work_date)} sampai {fmtTime(s.shift.check_out_end_at, s.work_date)}
            </div>
          )}
          {s.needs_hr_review && (
            <div className="text-warning-ink">Menunggu pemeriksaan HR{s.hr_review_status ? ` (${s.hr_review_status})` : ''}</div>
          )}
        </li>
      ))}
    </ul>
  )
}
