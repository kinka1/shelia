import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusPill } from '@/features/shelia/Sessions'
import { explain, type LogEntry } from '@/lib/apiLog'
import { wib } from '@/lib/time'
import { JsonView } from './JsonView'

const TAB = 'rounded-none px-0 py-2 text-[13.5px] font-normal text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--primary))]'

export function LogDetail({ entry }: { entry: LogEntry }) {
  const x = explain(entry)
  const tiles: [string, string][] = [
    ['Metode', entry.method],
    ['Status', entry.status === null ? 'Gagal' : String(entry.status)],
    ['Durasi', `${entry.ms} ms`],
    ['Waktu', `${wib(entry.at, true)} WIB`],
  ]
  return (
    <div className="flex flex-col rounded-xl border bg-card p-4">
      <div className={`mb-3 flex items-start gap-3 rounded-lg border px-3.5 py-3 ${x.bad ? 'border-destructive/25 bg-destructive/[0.07]' : 'border-success/25 bg-success/[0.07]'}`}>
        <StatusPill status={x.bad ? 'rejected' : 'closed'} label={String(entry.status ?? 'Gagal')} />
        <div>
          <strong className="block text-sm">{x.title}</strong>
          <span className="text-[13px]">{x.text}</span>
        </div>
      </div>
      <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-lg border px-2.5 py-2">
            <dt className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{k}</dt>
            <dd className="text-sm font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <Tabs defaultValue="req" key={entry.id}>
        <TabsList className="mb-2.5 flex h-auto w-full justify-start gap-[18px] rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="req" className={TAB}>Request</TabsTrigger>
          <TabsTrigger value="res" className={TAB}>Response</TabsTrigger>
          <TabsTrigger value="hdr" className={TAB}>Header</TabsTrigger>
        </TabsList>
        <TabsContent value="req" className="mt-0"><JsonView value={entry.reqBody} /></TabsContent>
        <TabsContent value="res" className="mt-0"><JsonView value={entry.resBody} /></TabsContent>
        <TabsContent value="hdr" className="mt-0 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Header permintaan</p>
          <JsonView value={entry.reqHeaders} />
          <p className="text-xs font-semibold text-muted-foreground">Header respons</p>
          <JsonView value={entry.resHeaders} />
        </TabsContent>
      </Tabs>
      <p className="mt-2 text-[12.5px] text-muted-foreground">Nilai rahasia tidak pernah ditampilkan. Log hilang saat tab ditutup.</p>
    </div>
  )
}
