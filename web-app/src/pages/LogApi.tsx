import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LogDetail } from '@/features/log/LogDetail'
import { LogList } from '@/features/log/LogList'
import { clearLog, useApiLog, type LogEntry } from '@/lib/apiLog'

const isBad = (e: LogEntry) => e.status === null || e.status >= 400

function Seg<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 gap-0.5 rounded-lg bg-muted p-[3px]">
      {options.map(([v, text]) => (
        <button
          key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className="rounded-md px-3 text-[13px] text-muted-foreground aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:shadow-sm"
        >{text}</button>
      ))}
    </div>
  )
}

export default function LogApi() {
  const all = useApiLog()
  const [source, setSource] = useState<'all' | 'shelia' | 'maganghub'>('all')
  const [status, setStatus] = useState<'all' | 'bad'>('all')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<number>()

  const failed = all.filter(isBad).length
  const needle = q.trim().toLowerCase()
  const shown = all.filter((e) =>
    (source === 'all' || e.source === source) && (status === 'all' || isBad(e)) &&
    (!needle || e.path.toLowerCase().includes(needle) || e.title.toLowerCase().includes(needle)))
  const selected = shown.find((e) => e.id === picked) ?? shown[0]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Log API</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{all.length} panggilan di sesi ini · {failed} gagal</p>
        </div>
        <Button variant="outline" onClick={clearLog}>Bersihkan</Button>
      </div>
      {all.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-[13px] text-muted-foreground">Belum ada panggilan API di sesi ini.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Seg label="Sumber" value={source} onChange={setSource} options={[['all', 'Semua'], ['shelia', 'Shelia'], ['maganghub', 'MagangHub']]} />
            <Seg label="Status" value={status} onChange={setStatus} options={[['all', 'Semua status'], ['bad', `Gagal (${failed})`]]} />
            <span className="flex-1" />
            <Input className="w-full sm:max-w-[260px]" placeholder="Cari path atau judul" aria-label="Cari" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.25fr]">
            <LogList entries={shown} selectedId={selected?.id} onSelect={setPicked} />
            {selected
              ? <div className="min-w-0"><LogDetail entry={selected} /></div>
              : <p className="text-[13px] text-muted-foreground">Tidak ada panggilan yang cocok.</p>}
          </div>
        </>
      )}
    </div>
  )
}
