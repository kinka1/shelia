import { useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchTodayCommits, type Settings } from '@/lib/gitCommits'
import { generateLog, type LogTexts } from '@/lib/generateLog'

const KEY = 'generate.settings'
const SMALL = 'h-6 rounded-md px-2 text-xs font-semibold'
const BLANK: Settings = { repo: '', token: '', deepseekKey: '', username: '' }

// Kept in this browser only, like the other tokens.
export function getGenSettings(): Settings | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s?.repo && s?.deepseekKey ? s : null } catch { return null }
}
export const setGenSettings = (s: Settings): void => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked */ } }
export const clearGenSettings = (): void => { try { localStorage.removeItem(KEY) } catch { /* storage blocked */ } }

function check(s: Settings): string {
  if (!s.repo.trim() || !s.deepseekKey.trim()) return 'Isi link repo dan API key DeepSeek.'
  if (!s.token?.trim() && !s.username?.trim()) return 'Tanpa token, isi username Git Anda.'
  return ''
}

/** Generate fills the three texts from today's commits; the user reviews before sending. */
export function GenerateLog({ value, onChange }: { value: LogTexts; onChange: (v: LogTexts) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Settings>(BLANK)
  const [formErr, setFormErr] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const running = useRef(false)

  function openSettings() { setForm({ ...BLANK, ...getGenSettings() }); setFormErr(''); setOpen(true) }

  async function run(s: Settings) {
    if (running.current) return
    running.current = true; setBusy(true); setErr(''); setNote('')
    const before = value
    try {
      const c = await fetchTodayCommits(s)
      if ('error' in c) return setErr(c.error)
      if (c.trimmed) setNote('Hanya 30 commit pertama dipakai')
      const t = await generateLog(c.commits, s.deepseekKey)
      if ('error' in t) return setErr(t.error)
      onChange(t)
      toast.success(`Dibuat dari ${c.commits.length} commit. Periksa sebelum mengirim.`, { action: { label: 'Batalkan', onClick: () => onChange(before) } })
    } finally { running.current = false; setBusy(false) }
  }

  function generate() { const s = getGenSettings(); if (s) void run(s); else openSettings() }

  function save() {
    const s = { repo: form.repo.trim(), token: form.token?.trim(), deepseekKey: form.deepseekKey.trim(), username: form.username?.trim() }
    const e = check(s)
    if (e) return setFormErr(e)
    setGenSettings(s); setOpen(false); void run(s)
  }

  const field = (id: keyof Settings, label: string, secret = false) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`gen-${id}`}>{label}</Label>
      <Input id={`gen-${id}`} type={secret && !show ? 'password' : 'text'} autoComplete="off" value={form[id] || ''}
        onChange={(e) => setForm({ ...form, [id]: e.target.value })} />
    </div>
  )

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className={SMALL} disabled={busy} onClick={generate}>
        {busy ? 'Membuat…' : 'Generate'}
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Pengaturan Generate" onClick={openSettings}>
        <Settings2 className="size-3.5" />
      </Button>
      <span className="text-xs text-muted-foreground">Isi otomatis dari commit hari ini</span>
      {note && <span className="text-xs text-warning-ink">{note}</span>}
      {err && <p role="alert" className="w-full text-xs text-destructive-ink">{err}</p>}

      {/* No <form> here: the dialog lives inside the log form and must not submit it. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pengaturan Generate</DialogTitle>
            <DialogDescription>Disimpan hanya di browser ini. Yang dikirim ke DeepSeek hanya pesan commit dan nama file, bukan kode.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {field('repo', 'Link repo (GitHub atau GitLab)')}
            {field('token', 'Token akses (opsional untuk repo publik)', true)}
            {field('deepseekKey', 'API key DeepSeek', true)}
            {field('username', 'Username Git (hanya tanpa token)')}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Tampilkan kunci
            </label>
            {formErr && <p className="text-xs text-destructive-ink">{formErr}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { clearGenSettings(); setForm(BLANK); setOpen(false) }}>Hapus</Button>
            <Button type="button" onClick={save}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
