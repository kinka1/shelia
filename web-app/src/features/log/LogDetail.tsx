import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { explain, type LogEntry } from '@/lib/apiLog'
import { wib } from '@/lib/time'
import { JsonView } from './JsonView'

export function LogDetail({ entry }: { entry: LogEntry }) {
  const x = explain(entry)
  const tiles: [string, string][] = [
    ['Metode', entry.method],
    ['Status', entry.status === null ? 'Gagal' : String(entry.status)],
    ['Durasi', `${entry.ms} ms`],
    ['Waktu', `${wib(entry.at, true)} WIB`],
  ]
  const Icon = x.bad ? AlertTriangle : CheckCircle2
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{entry.title}</h2>
        <p className="break-all font-mono text-xs text-muted-foreground">{entry.path}</p>
      </div>
      <div className={`flex gap-2 rounded-md p-3 text-sm ${x.bad ? 'bg-destructive/10 text-destructive-ink' : 'bg-success/10 text-success-ink'}`}>
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div><strong>{x.title}</strong><p>{x.text}</p></div>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-md border p-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-sm font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <Tabs defaultValue="req" key={entry.id}>
        <TabsList>
          <TabsTrigger value="req">Request</TabsTrigger>
          <TabsTrigger value="res">Response</TabsTrigger>
          <TabsTrigger value="hdr">Header</TabsTrigger>
        </TabsList>
        <TabsContent value="req"><JsonView value={entry.reqBody} /></TabsContent>
        <TabsContent value="res"><JsonView value={entry.resBody} /></TabsContent>
        <TabsContent value="hdr" className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Header permintaan</p>
          <JsonView value={entry.reqHeaders} />
          <p className="text-xs font-medium text-muted-foreground">Header respons</p>
          <JsonView value={entry.resHeaders} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
