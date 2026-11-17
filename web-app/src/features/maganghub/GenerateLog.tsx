import { useEffect, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchTodayCommits, repoLinks, tokenUrl, type RepoLink, type Settings } from '@/lib/gitCommits'
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
  useEffect(() => { onBusy?.(busy) }, [busy, onBusy])

  function openSettings() {
    const s = getGenSettings()
    setForm(s ? { repos: s.repos!.map((r) => ({ url: r.url, token: r.token ?? '' })), deepseekKey: s.deepseekKey, model: s.model ?? DEFAULT_MODEL } : BLANK)
    setFormErr(''); setTried(false); setShow(false); setOpen(true)
  }

  async function run(s: Settings) {
    if (running.current) return
    running.current = true; setBusy(true); setErr(''); setNote('')
    const before = value
    try {
      const c = await fetchTodayCommits(s)
      if ('error' in c) return setErr(c.error)
      setNote([c.note, c.trimmed && 'Hanya 30 commit pertama dipakai'].filter(Boolean).join('\n'))
      const t = await generateLog(c.commits, s.deepseekKey, s.model ?? DEFAULT_MODEL)
      if ('error' in t) return setErr(t.error)
      onChange(t)
      toast.success(`Dibuat dari ${c.commits.length} commit. Periksa sebelum mengirim.`, { action: { label: 'Batalkan', onClick: () => onChange(before) } })
    } finally { running.current = false; setBusy(false) }
  }

  function generate() { const s = getGenSettings(); if (s) void run(s); else openSettings() }

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
      <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Pengaturan Generate" onClick={openSettings}>
        <Settings2 className="size-3.5" />
      </Button>
      {saved
        ? <span className="text-xs text-success-ink">Diatur · {repoLinks(saved).length} repo</span>
        : <span className="text-xs text-warning-ink">Belum diatur</span>}
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
