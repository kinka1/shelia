import { Badge } from '@/components/ui/badge'
import { STATE_LABEL, fmtTime } from '@/lib/attendance'

export function Sessions({ sessions }: { sessions: any[] }) {
  if (!sessions.length) return null
  return (
    <ul className="divide-y rounded-md border">
      {sessions.map((s, i) => (
        <li key={i} className="space-y-1 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <strong>Sesi {s.session_no ?? '-'}{s.shift?.name ? ` · ${s.shift.name}` : ''}</strong>
            <Badge variant="secondary">{STATE_LABEL[s.state] || s.state || '-'}</Badge>
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
