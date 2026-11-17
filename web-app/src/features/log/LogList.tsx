import { StatusPill } from '@/features/shelia/Sessions'
import { groupEntries, type LogEntry } from '@/lib/apiLog'
import { wib } from '@/lib/time'

const METHOD: Record<string, string> = {
  GET: 'bg-success/10 text-success-ink',
  POST: 'bg-primary/10 text-primary-ink',
}

export function LogList({ entries, selectedId, onSelect }: {
  entries: LogEntry[]; selectedId: number | undefined; onSelect: (id: number) => void
}) {
  return (
    <div>
      {groupEntries(entries).map((g, gi) => (
        <section key={g.key}>
          {/* Daftar newest first, jadi entri terakhir adalah yang tertua. */}
          <h3 className={`mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground ${gi ? 'mt-3.5' : ''}`}>
            {g.action} · {wib(g.entries[g.entries.length - 1].at)}<span aria-hidden className="h-px flex-1 bg-border" />
          </h3>
          <ul>
            {g.entries.map((e) => {
              const bad = e.status === null || e.status >= 400
              return (
                <li key={e.id}>
                  <button
                    type="button" data-testid="log-row" aria-pressed={e.id === selectedId} onClick={() => onSelect(e.id)}
                    className="mb-1.5 grid w-full grid-cols-[52px_1fr_auto] items-center gap-x-2.5 gap-y-0.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50 aria-pressed:border-primary/45 aria-pressed:bg-primary/[0.04] aria-pressed:ring-[3px] aria-pressed:ring-primary/10"
                  >
                    <span className={`rounded py-1 text-center font-mono text-[11px] font-semibold leading-none ${METHOD[e.method] ?? 'bg-muted text-muted-foreground'}`}>{e.method}</span>
                    <span className="min-w-0 text-sm font-semibold">{e.title}</span>
                    <StatusPill status={bad ? 'rejected' : 'closed'} label={String(e.status ?? 'Gagal')} />
                    <span className="col-span-2 col-start-2 break-all font-mono text-xs leading-[1.4] text-muted-foreground">{e.path} · {e.ms} ms</span>
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
