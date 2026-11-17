import { useEffect, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchTodayCommits, periodLabel, repoLinks, tokenUrl, type Days, type RepoLink, type Settings } from '@/lib/gitCommits'
import { todayWIB } from '@/lib/dailyLog'
import { DEFAULT_MODEL, MODELS, generateLog, type LogTexts } from '@/lib/generateLog'

const KEY = 'generate.settings'
const SMALL = 'h-6 rounded-md px-2 text-xs font-semibold'
const MAX_REPOS = 10
type Form = { repos: RepoLink[]; deepseekKey: string; model: string }
const BLANK: Form = { repos: [{ url: '', token: '' }], deepseekKey: '', model: DEFAULT_MODEL }

// Kept in this browser only, like the other tokens. An older single-repo setting reads as repo 1.
export function getGenSettings(): Settings | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    const repos = s ? repoLinks(s) : []
    // An unknown or retired model (e.g. deepseek-chat) falls back to the recommended one.
    const model = MODELS.some((m) => m.id === s.model) ? s.model : DEFAULT_MODEL
    return repos.length && s.deepseekKey ? { repos, deepseekKey: s.deepseekKey, username: s.username, model } : null
  } catch { return null }
}
export const setGenSettings = (s: Settings): void => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked */ } }
export const clearGenSettings = (): void => { try { localStorage.removeItem(KEY) } catch { /* storage blocked */ } }

/** Every field is required (a token per repo, so the user is known from it). */
const MAX_DAYS = 31
const dayDiff = (d: Days) => (Date.parse(d.until) - Date.parse(d.from)) / 86_400_000
function checkDays(d: Days, today: string): string {
  if (!d.from || !d.until) return 'Isi tanggal "Dari" dan "Sampai".'
  if (d.until > today) return 'Tanggal tidak boleh melewati hari ini.'
  if (d.from > d.until) return 'Tanggal "Dari" harus sebelum atau sama dengan "Sampai".'
  if (dayDiff(d) + 1 > MAX_DAYS) return `Rentang paling lama ${MAX_DAYS} hari.`
  return ''
}

const complete = (f: Form) => !!f.deepseekKey.trim() && f.repos.every((r) => r.url.trim() && r.token?.trim())

/** Generate fills the three texts from today's commits; the user reviews before sending. */
export function GenerateLog({ value, onChange, onBusy }: { value: LogTexts; onChange: (v: LogTexts) => void; onBusy?: (busy: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(BLANK)
  const [formErr, setFormErr] = useState('')
  const [tried, setTried] = useState(false) // mark empty fields only after a Simpan attempt
  const [saved, setSaved] = useState(getGenSettings)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const running = useRef(false)
  const today = todayWIB()
  const [ranged, setRanged] = useState(false) // Pilih tanggal: generate from a from–until range instead of today
  const [days, setDays] = useState<Days>({ from: today, until: today })
  useEffect(() => { onBusy?.(busy) }, [busy, onBusy])
  // A reminder click opens the page with ?generate=1: generate once, only into empty fields.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (!q.has('generate')) return
    q.delete('generate')
    window.history.replaceState(window.history.state, '', window.location.pathname + (q.size ? `?${q}` : '') + window.location.hash)
    const s = getGenSettings()
    if (s && !value.activity_log.trim() && !value.lesson_learned.trim() && !value.obstacles.trim()) void run(s)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openSettings() {
    const s = getGenSettings()
    setForm(s ? { repos: s.repos!.map((r) => ({ url: r.url, token: r.token ?? '' })), deepseekKey: s.deepseekKey, model: s.model ?? DEFAULT_MODEL } : BLANK)
    setFormErr(''); setTried(false); setShow(false); setOpen(true)
  }

  async function run(s: Settings, d?: Days) {
    if (running.current) return
    running.current = true; setBusy(true); setErr(''); setNote('')
    const before = value
    try {
      const c = d ? await fetchTodayCommits(s, new Date(), d) : await fetchTodayCommits(s)
      if ('error' in c) return setErr(c.error)
      setNote([c.note, c.trimmed && 'Hanya 30 commit pertama dipakai'].filter(Boolean).join('\n'))
      const onlyToday = !d || (d.from === today && d.until === today)
      const t = onlyToday
        ? await generateLog(c.commits, s.deepseekKey, s.model ?? DEFAULT_MODEL)
        : await generateLog(c.commits, s.deepseekKey, s.model ?? DEFAULT_MODEL, periodLabel(d))
      if ('error' in t) return setErr(t.error)
      onChange(t)
      toast.success(`Dibuat dari ${c.commits.length} commit. Periksa sebelum mengirim.`, { action: { label: 'Batalkan', onClick: () => onChange(before) } })
    } finally { running.current = false; setBusy(false) }
  }

  function generate() {
    const s = getGenSettings()
    if (!s) return openSettings()
    if (!ranged) return void run(s)
    const e = checkDays(days, today)
    if (e) return setErr(e)
    void run(s, days)
  }

  function save() {
    setTried(true)
    if (!complete(form)) return setFormErr('Lengkapi semua isian yang wajib.')
    const s: Settings = { repos: form.repos.map((r) => ({ url: r.url.trim(), token: r.token!.trim() })), deepseekKey: form.deepseekKey.trim(), model: form.model }
    setGenSettings(s); setSaved(s); setOpen(false); void run(s)
  }

  const setRepo = (i: number, patch: Partial<RepoLink>) =>
    setForm({ ...form, repos: form.repos.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const input = (id: string, label: string, val: string, onVal: (v: string) => void, opts: { secret?: boolean; placeholder?: string; srLabel?: string } = {}) => {
    const invalid = tried && !val.trim()
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>
          <span>{label}</span>{opts.srLabel && <span className="sr-only"> {opts.srLabel}</span>}
          <span aria-hidden className="text-destructive-ink">{' '}*</span>
        </Label>
        <Input id={id} type={opts.secret && !show ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={opts.placeholder}
          required aria-required aria-invalid={invalid || undefined} className={invalid ? 'border-destructive' : undefined}
          value={val} onChange={(e) => onVal(e.target.value)} />
      </div>
    )
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className={SMALL} disabled={busy} onClick={generate}>
        {busy ? 'Membuat…' : 'Generate'}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" aria-expanded={ranged} disabled={busy}
        onClick={() => { setRanged(!ranged); setErr('') }}>{ranged ? 'Hari ini saja' : 'Pilih tanggal'}</Button>
      <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Pengaturan Generate" onClick={openSettings}>
        <Settings2 className="size-3.5" />
      </Button>
      {saved
        ? <span className="text-xs text-success-ink">Diatur · {repoLinks(saved).length} repo</span>
        : <span className="text-xs text-warning-ink">Belum diatur</span>}
      {ranged && (
        <div className="flex w-full flex-wrap items-end gap-2">
          {(['from', 'until'] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1">
              <Label htmlFor={`gen-${k}`} className="text-xs font-semibold text-muted-foreground">{k === 'from' ? 'Dari' : 'Sampai'}</Label>
              <Input id={`gen-${k}`} type="date" className="h-8 w-auto text-xs" max={today} disabled={busy}
                value={days[k]} onChange={(e) => { setDays({ ...days, [k]: e.target.value }); setErr('') }} />
            </div>
          ))}
          <span className="pb-2 text-xs text-muted-foreground">Paling lama {MAX_DAYS} hari.</span>
        </div>
      )}
      {note && <p className="w-full whitespace-pre-line text-xs text-warning-ink">{note}</p>}
      {err && <p role="alert" className="w-full whitespace-pre-line text-xs text-destructive-ink">{err}</p>}

      {/* No <form> here: the dialog lives inside the log form and must not submit it. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pengaturan Generate</DialogTitle>
            <DialogDescription>Disimpan hanya di browser ini. Yang dikirim ke DeepSeek hanya pesan commit dan nama file, bukan kode.</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              Semua isian wajib (<span aria-hidden className="text-destructive-ink">*</span>). Token cukup dengan akses baca; tautan
              “Buat token” membuka halaman GitHub/GitLab yang sudah terisi.
            </p>
            {form.repos.map((r, i) => (
              <fieldset key={i} className="flex flex-col gap-2 rounded-md border p-3">
                <legend className="flex w-full items-center px-1 text-xs font-semibold text-muted-foreground">
                  Repo {i + 1}
                  {form.repos.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" aria-label={`Hapus repo ${i + 1}`}
                      onClick={() => setForm({ ...form, repos: form.repos.filter((_, j) => j !== i) })}>Hapus</Button>
                  )}
                </legend>
                {input(`gen-repo-${i}`, `Link repo ${i + 1}`, r.url, (v) => setRepo(i, { url: v }), { placeholder: 'https://github.com/nama/repo' })}
                {input(`gen-token-${i}`, 'Token akses (GitHub atau GitLab)', r.token ?? '', (v) => setRepo(i, { token: v }), { secret: true, srLabel: `repo ${i + 1}` })}
                {(() => {
                  const t = tokenUrl(r.url)
                  return t ? (
                    <p className="text-xs text-muted-foreground">
                      <a href={t.href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-ink underline underline-offset-2">
                        Buat token di {t.site}<span className="sr-only"> (tab baru)</span> ↗
                      </a>{' '}
                      — isiannya sudah terisi, hanya akses baca. Salin token yang dibuat ke sini.
                    </p>
                  ) : <p className="text-xs text-muted-foreground">Isi link repo dulu untuk membuat token.</p>
                })()}
              </fieldset>
            ))}
            {form.repos.length < MAX_REPOS && (
              <Button type="button" variant="outline" size="sm" className={`${SMALL} self-start`}
                onClick={() => setForm({ ...form, repos: [...form.repos, { url: '', token: '' }] })}>Tambah repo</Button>
            )}
            {input('gen-deepseekKey', 'API key DeepSeek', form.deepseekKey, (v) => setForm({ ...form, deepseekKey: v }), { secret: true })}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-model"><span>Model DeepSeek</span><span aria-hidden className="text-destructive-ink">{' '}*</span></Label>
              <select id="gen-model" required aria-required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Tampilkan kunci
            </label>
            {formErr && <p role="alert" className="text-xs text-destructive-ink">{formErr}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { clearGenSettings(); setSaved(null); setForm(BLANK); setOpen(false) }}>Hapus semua</Button>
            <Button type="button" onClick={save}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
