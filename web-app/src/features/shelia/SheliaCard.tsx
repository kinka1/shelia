import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RELOAD_CODES, buildAttendForm, currentStep, fmtMeters, fmtTime, shiftLabel, successText, tokenUsable,
  type TimedToken,
} from '@/lib/attendance'
import { errorText, sheliaApi, type ApiError } from '@/lib/shelia'
import { extRemind, remindSchedule } from '@/lib/extension'
import { CameraCapture } from './CameraCapture'
import { SessionNotes } from './Sessions'
import type { useToday } from './useToday'
import { useSession } from '@/features/session/SessionProvider'
import { StatusPill } from './Sessions'

const STEPS = ['1 · Shift dipilih', '2 · Foto wajah', '3 · Kirim']
const hhmm = (t: unknown) => (typeof t === 'string' ? t.slice(0, 5) : '?')

/** Sudah absen masuk hari ini: bagian Shelia dianggap selesai dan dilipat. */
export const sheliaDone = (t: any): boolean => t?.status === 'checked_in' || t?.status === 'late'

function Note({ tone, children }: { tone: 'warning' | 'destructive' | 'info'; children: React.ReactNode }) {
  const cls = { warning: 'bg-warning/10 text-warning-ink', destructive: 'bg-destructive/10 text-destructive-ink', info: 'bg-info/10 text-info-ink' }[tone]
  return (
    <div role="alert" className={`flex gap-2 whitespace-pre-line rounded-md px-3 py-2 text-[13px] ${cls}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <div>{children}</div>
    </div>
  )
}

export function SheliaCard({ today, shifts, loading, reload, error }: ReturnType<typeof useToday>) {
  const { logout } = useSession()
  const refreshing = loading && !!today
  const [shiftId, setShiftId] = useState('')
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [faceToken, setFaceToken] = useState<TimedToken | null>(null)
  const [bypass, setBypass] = useState<TimedToken | null>(null)
  const [busy, setBusy] = useState('')
  const [formError, setFormError] = useState('')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (shifts.length === 1) setShiftId(shifts[0].id)
    else if (!shifts.some((s) => s.id === shiftId)) setShiftId('')
  }, [shifts]) // eslint-disable-line react-hooks/exhaustive-deps

  const kind = today?.next_action
  const canAttend = kind === 'check_in' || kind === 'check_out'
  const isIn = kind === 'check_in'
  const faceOn = today?.setup?.face_enrolled === true
  const faceBroken = today?.setup?.face_enrolled === false
  const needShift = isIn && shifts.length > 0
  const now = Date.now()
  const activeBypass = faceOn && bypass && tokenUsable(bypass, now) ? bypass : null
  const blockedOutside = !!today?.is_outside_location && today?.allow_outside_site === false
  const step = currentStep({ needShift, shiftId, faceOn, hasPhoto: !!photo, faceToken, now })
  const recent: string[] = today?.required_note && Array.isArray(today.recent_reasons) ? today.recent_reasons.filter(Boolean).map(String) : []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setFormError('')
    if (needShift && !shiftId) return setFormError('Pilih shift dulu.')
    const r = reason.trim()
    if (today.required_note && (r.length < 10 || r.length > 255)) return setFormError('Alasan wajib diisi, 10 sampai 255 karakter.')
    if (faceOn && !photo && (activeBypass || !tokenUsable(faceToken, Date.now()))) return setFormError('Ambil foto wajah dulu.')

    try {
      let ft = faceToken
      if (faceOn && !activeBypass && !tokenUsable(ft, Date.now())) {
        setBusy('Memverifikasi wajah…')
        const form = new FormData()
        form.append('file_photo', photo!, photo instanceof File && photo.name ? photo.name : photo!.type === 'image/png' ? 'selfie.png' : 'selfie.jpg')
        try {
          const res = await sheliaApi('/v2/attendance/face/verify', { method: 'POST', form, action: 'Verifikasi wajah' })
          const exp = Date.parse(res.data?.expires_at)
          ft = { token: res.data?.face_token, expiresAt: Number.isFinite(exp) ? exp : Date.now() + 9 * 60 * 1000 }
          setFaceToken(ft)
        } catch (err) {
          const m = (err as ApiError).meta
          if (m?.bypass_allowed && m?.bypass_token) {
            const exp = Date.parse(m.bypass_expires_at)
            setBypass({ token: m.bypass_token, expiresAt: Number.isFinite(exp) ? exp : Date.now() + 25 * 60 * 1000 })
          }
          throw err
        }
      }
      setBusy(isIn ? 'Mengirim check-in…' : 'Mengirim check-out…')
      const res = await sheliaApi(`/v2/attendance/${isIn ? 'check-in' : 'check-out'}`, {
        method: 'POST',
        action: isIn ? 'Absen masuk' : 'Absen pulang',
        form: buildAttendForm({
          isIn, shiftId: needShift ? shiftId : undefined, attendanceId: today.active_session?.attendance_id,
          reason: today.required_note ? r : undefined,
          faceToken: faceOn && !activeBypass ? ft?.token : undefined,
          bypassToken: activeBypass?.token, photo: photo ?? undefined,
          photoName: photo instanceof File && photo.name ? photo.name : photo?.type === 'image/png' ? 'selfie.png' : 'selfie.jpg',
        }),
      })
      // face_token sekali pakai; check-out butuh verifikasi wajah baru.
      setFaceToken(null); setBypass(null); setPhoto(null); setReason('')
      toast.success(successText(isIn, res))
      await reload()
    } catch (err) {
      const e2 = err as ApiError
      if (e2.status === 401) return
      if (e2.code === 'ERR-HR-028') setFaceToken(null)
      setFormError(errorText(e2))
      if (e2.code && RELOAD_CODES.has(e2.code)) void reload()
    } finally {
      setBusy('')
    }
  }

  const shift = shifts.find((x) => x.id === shiftId)
  const times = JSON.stringify(remindSchedule(shift))
  // The picked (or only) shift sets the reminder times in the extension.
  useEffect(() => { const t = JSON.parse(times); if (t) void extRemind({ schedule: t }) }, [times])
  const outside = !!today?.is_outside_location
  // Satu baris pendek, seperti "Log harian" di MagangHub: langkahnya, shift, dan posisi terhadap area.
  const subtitle = [
    isIn ? 'Absen masuk' : kind === 'check_out' ? 'Absen pulang' : 'Absen kantor',
    shift && `Shift ${shift.name} ${hhmm(shift.check_in_start)}-${hhmm(shift.check_out_end)}`,
    today?.distance_meters != null && !outside && 'di dalam area',
  ].filter(Boolean).join(' · ')
  // check-out still pending → keep the form open so the afternoon action isn't hidden
  const done = sheliaDone(today) && kind !== 'check_out'
  const sessions: any[] = Array.isArray(today?.sessions) ? today.sessions : []
  const last = sessions[sessions.length - 1]
  const inAt = fmtTime(last?.check_in_time, last?.work_date)
  const summary = `Selesai untuk hari ini${inAt !== '-' ? ` · masuk ${inAt}` : ''}`
  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          Shelia
        </h2>
        <span className="flex-1" />
        <StatusPill status="closed" label="Terhubung" />
        {done && expanded && <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>Tutup</Button>}
        <Button variant="outline" size="sm" className="h-6 rounded-md px-2 text-xs font-semibold" disabled={loading} onClick={() => void reload()}>
          {loading ? 'Memuat…' : 'Muat ulang status'}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void logout()}>Keluar</Button>
      </div>
      {/* While Muat ulang status runs the card is greyed and can't be clicked (unlocks on success or failure). */}
      <div inert={refreshing} aria-busy={refreshing || undefined} className={refreshing ? 'pointer-events-none select-none opacity-50 transition-opacity' : 'transition-opacity'}>
      {done && !expanded ? (
        <div className="mt-1 flex items-center gap-2 text-[13px]">
          <CheckCircle2 className="size-4 shrink-0 text-success-ink" aria-hidden />
          <span>{summary}</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>Lihat</Button>
        </div>
      ) : null}
      {done && !expanded ? error && <div className="mt-2"><Note tone="destructive">{error}</Note></div> : (<>
      {today && (
        <div className="mb-3 mt-0.5">
          <p className="text-[13px] text-muted-foreground">
            {subtitle}
            {outside && <span className="font-medium text-warning-ink"> · di luar area ({fmtMeters(today.distance_meters)} dari kantor)</span>}
          </p>
        </div>
      )}
      <div className="space-y-3">
        {error && <Note tone="destructive">{error}</Note>}
        {loading && !today && <Skeleton className="h-40 w-full" />}
        {today && (
          <>
            {today.missed_check_out && (
              <Note tone="warning">
                Sesi {today.missed_check_out.session_no ?? ''} tanggal {today.missed_check_out.work_date || '-'} belum di-check-out dan sudah lewat batasnya. Ajukan koreksi absen.
              </Note>
            )}
            {faceBroken && <Note tone="destructive">Foto wajah di HRIS belum ada atau tidak bisa dipakai. Perbarui foto profil di HRIS agar bisa absen.</Note>}
            {canAttend && (
              <form onSubmit={submit} className="space-y-3">
                <ol className="mb-3.5 grid grid-cols-3 gap-2 text-xs">
                  {STEPS.map((label, i) => {
                    const n = i + 1
                    const tone = n < step ? 'border-success text-success-ink' : n === step ? 'border-primary font-semibold text-primary-ink' : 'border-border text-muted-foreground'
                    return (
                      <li key={label} aria-current={n === step ? 'step' : undefined} className={`border-t-[3px] pt-1.5 ${tone}`}>
                        {label}
                      </li>
                    )
                  })}
                </ol>
                {needShift && shifts.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground">Shift</Label>
                    <Select value={shiftId} onValueChange={setShiftId}>
                      <SelectTrigger><SelectValue placeholder="Pilih shift" /></SelectTrigger>
                      <SelectContent>{shifts.map((s) => <SelectItem key={s.id} value={s.id}>{shiftLabel(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {faceOn && <CameraCapture photo={photo} onPhoto={setPhoto} onError={setFormError} />}
                {today.required_note && (
                  <div className="space-y-1">
                    <Label htmlFor="reason" className="text-xs font-semibold text-muted-foreground">Alasan</Label>
                    <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} className="min-h-[70px]" />
                    {recent.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {recent.map((x) => <Button key={x} type="button" size="sm" variant="outline" onClick={() => setReason(x)}>{x}</Button>)}
                      </div>
                    )}
                  </div>
                )}
                {blockedOutside && <Note tone="destructive">Koordinat absen berada di luar area site ({fmtMeters(today.distance_meters)}), dan site ini tidak mengizinkan absen dari luar area.</Note>}
                {activeBypass && <Note tone="info">Verifikasi wajah gagal 3 kali. Absen tetap bisa dikirim dengan foto ini, tetapi akan diperiksa HR.</Note>}
                {formError && <Note tone="destructive">{formError}</Note>}
                {step === 3 && (
                  <Button type="submit" className="w-full" disabled={!!busy || blockedOutside || faceBroken}>
                    {busy || (isIn ? 'Check-in' : 'Check-out') + (activeBypass ? ' (HR review)' : '')}
                  </Button>
                )}
              </form>
            )}
            <SessionNotes sessions={sessions} />
          </>
        )}
      </div>
      </>)}
      </div>
    </section>
  )
}
