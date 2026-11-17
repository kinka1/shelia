import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export function CameraCapture({ photo, onPhoto, onError }: {
  photo: Blob | null; onPhoto: (b: Blob | null) => void; onError: (msg: string) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const alive = useRef(true)
  const [live, setLive] = useState(false)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) { setUrl(null); return }
    const u = URL.createObjectURL(photo)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [photo])

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setLive(false)
  }
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; stop() }
  }, [])

  // srcObject dipasang begitu elemen video ada, bukan lewat timer.
  const attach = (el: HTMLVideoElement | null) => {
    video.current = el
    if (el && stream.current) { el.srcObject = stream.current; void el.play().catch(() => {}) }
  }

  async function open() {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError('Browser ini tidak bisa membuka kamera di halaman ini. Pakai tombol "Unggah foto".')
      return
    }
    try {
      stop()
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
      })
      if (!alive.current) { s.getTracks().forEach((t) => t.stop()); return }
      stream.current = s
      setLive(true)
    } catch (e: any) {
      stop()
      onError(`Kamera tidak bisa dibuka (${e?.name || e?.message}). Pakai tombol "Unggah foto".`)
    }
  }

  function shoot() {
    const v = video.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => { if (b) onPhoto(b); stop() }, 'image/jpeg', 0.9)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/jpeg', 'image/png'].includes(f.type)) return onError('Foto harus berformat jpg, jpeg, atau png.')
    if (f.size > MAX_PHOTO_BYTES) return onError('Ukuran foto maksimal 10 MB.')
    stop()
    onPhoto(f)
  }

  return (
    <div>
      <div className="relative mb-3 grid h-[150px] place-items-center overflow-hidden rounded-lg border border-dashed border-input bg-muted px-3 text-center text-[13px] text-muted-foreground">
        {url && !live ? <img src={url} alt="Foto wajah" className="absolute inset-0 h-full w-full object-cover" />
          : live ? 'Kamera aktif. Posisikan wajah di tengah bingkai.'
          : 'Buka kamera atau unggah foto.'}
        {/* Teksnya di bawah video: terlihat sampai bingkai pertama tiba. */}
        {live && <video ref={attach} playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" asChild>
          <label className="cursor-pointer">Unggah foto
            <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={onFile} />
          </label>
        </Button>
        <span className="flex-1" />
        {live
          ? <Button type="button" onClick={shoot}>Ambil foto</Button>
          : <Button type="button" onClick={open}>{photo ? 'Foto ulang' : 'Buka kamera'}</Button>}
      </div>
    </div>
  )
}
