import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RELOAD_CODES, STATUS_LABEL, buildAttendForm, currentStep, fmtMeters, shiftLabel, successText, tokenUsable,
  type TimedToken,
} from '@/lib/attendance'
import { errorText, sheliaApi, type ApiError } from '@/lib/shelia'
import { CameraCapture } from './CameraCapture'
import { Sessions, StatusPill } from './Sessions'
import { useToday } from './useToday'

const STEPS = ['1 · Shift', '2 · Foto wajah', '3 · Kirim']

function Note({ tone, children }: { tone: 'warning' | 'destructive' | 'info'; children: React.ReactNode }) {
  const cls = { warning: 'bg-warning/10 text-warning-ink', destructive: 'bg-destructive/10 text-destructive-ink', info: 'bg-info/10 text-info-ink' }[tone]
  return (
    <div role="alert" className={`flex gap-2 whitespace-pre-line rounded-md p-3 text-sm ${cls}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <div>{children}</div>
    </div>
  )
}

export function SheliaCard() {
  const { today, shifts, loading, reload, error } = useToday()
  const [shiftId, setShiftId] = useState('')
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [faceToken, setFaceToken] = useState<TimedToken | null>(null)
  const [bypass, setBypass] = useState<TimedToken | null>(null)
  const [busy, setBusy] = useState('')
  const [formError, setFormError] = useState('')

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

  const site = today?.site
  const siteText = site
    ? (site.name || '-') + (site.business_site_name && site.business_site_name !== site.name ? ` (${site.business_site_name})` : '')
    : today?.setup?.geofence_configured === null ? 'Pengecekan lokasi tidak aktif' : '-'
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Shelia</CardTitle>
          {today && <StatusPill status={today.status} label={STATUS_LABEL[today.status] || today.status || '-'} />}
        </div>
        <Button variant="ghost" size="icon" aria-label="Muat ulang" disabled={loading} onClick={() => void reload()}>
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Note tone="destructive">{error}</Note>}
        {loading && !today && <Skeleton className="h-40 w-full" />}
        {today && (
          <>
            <div className="space-y-1 text-sm">
              <p>{today.message || '-'}</p>
              <p className="text-muted-foreground">
                {today.work_date || '-'}
                {' · '}{siteText}
                {today.distance_meters != null ? ` · ${fmtMeters(today.distance_meters)}${site?.radius_meters ? ` (radius ${fmtMeters(site.radius_meters)})` : ''} ${today.is_outside_location ? 'di luar area' : 'di dalam area'}` : ''}
              </p>
            </div>
            {today.missed_check_out && (
              <Note tone="warning">
                Sesi {today.missed_check_out.session_no ?? ''} tanggal {today.missed_check_out.work_date || '-'} belum di-check-out dan sudah lewat batasnya. Ajukan koreksi absen.
              </Note>
            )}
            {faceBroken && <Note tone="destructive">Foto wajah di HRIS belum ada atau tidak bisa dipakai. Perbarui foto profil di HRIS agar bisa absen.</Note>}
            {canAttend && (
              <form onSubmit={submit} className="space-y-4">
                <ol className="flex flex-wrap gap-2 text-xs font-medium">
                  {STEPS.map((label, i) => {
                    const n = i + 1
                    const done = n < step
                    return (
                      <li key={label} aria-current={n === step ? 'step' : undefined}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${done ? 'bg-success/10 text-success-ink' : n === step ? 'bg-primary/10 text-primary-ink' : 'bg-muted text-muted-foreground'}`}>
                        {done && <Check className="size-3" />} {label}
                      </li>
                    )
                  })}
                </ol>
                {needShift && (
                  <div className="space-y-1.5">
                    <Label>Shift</Label>
                    <Select value={shiftId} onValueChange={setShiftId}>
                      <SelectTrigger><SelectValue placeholder="Pilih shift" /></SelectTrigger>
                      <SelectContent>{shifts.map((s) => <SelectItem key={s.id} value={s.id}>{shiftLabel(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {faceOn && <CameraCapture photo={photo} onPhoto={setPhoto} onError={setFormError} />}
                {today.required_note && (
                  <div className="space-y-1.5">
                    <Label htmlFor="reason">Alasan</Label>
                    <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
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
                <Button type="submit" className="w-full" disabled={!!busy || blockedOutside || faceBroken}>
                  {busy || (isIn ? 'Check-in' : 'Check-out') + (activeBypass ? ' (HR review)' : '')}
                </Button>
              </form>
            )}
            <Sessions sessions={Array.isArray(today.sessions) ? today.sessions : []} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
