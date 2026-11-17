import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { groupEntries, type LogEntry } from '@/lib/apiLog'
import { wib } from './LogDetail'

export function LogList({ entries, selectedId, onSelect }: {
  entries: LogEntry[]; selectedId: number | undefined; onSelect: (id: number) => void
}) {
  return (
    <div className="space-y-4">
      {groupEntries(entries).map((g) => (
        <section key={g.key} className="space-y-1">
          {/* Daftar newest first, jadi entri terakhir adalah yang tertua. */}
          <h3 className="text-xs font-medium text-muted-foreground">{g.action} · {wib(g.entries[g.entries.length - 1].at)}</h3>
          <ul className="divide-y rounded-md border">
            {g.entries.map((e) => {
              const bad = e.status === null || e.status >= 400
              const Icon = bad ? AlertTriangle : CheckCircle2
              return (
                <li key={e.id}>
                  <button
                    type="button" data-testid="log-row" aria-pressed={e.id === selectedId} onClick={() => onSelect(e.id)}
                    className={`flex w-full items-start gap-2 p-3 text-left text-sm hover:bg-muted/50 aria-pressed:bg-primary/10 ${bad ? 'border-l-2 border-destructive' : ''}`}
                  >
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{e.method}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{e.title}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{e.path} · {e.ms} ms</span>
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bad ? 'bg-destructive/10 text-destructive-ink' : 'bg-success/10 text-success-ink'}`}>
                      <Icon className="size-3" /> {e.status ?? 'Gagal'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
