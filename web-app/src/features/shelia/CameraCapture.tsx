import { useEffect, useRef, useState } from 'react'
import { Camera, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export function CameraCapture({ photo, onPhoto, onError }: {
  photo: Blob | null; onPhoto: (b: Blob | null) => void; onError: (msg: string) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
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
  useEffect(() => stop, [])

  async function open() {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError('Browser ini tidak bisa membuka kamera di halaman ini. Pakai tombol "Unggah foto".')
      return
    }
    try {
      stop()
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
      })
      setLive(true)
      // elemen video baru dirender setelah setLive
      requestAnimationFrame(async () => {
        if (!video.current) return
        video.current.srcObject = stream.current
        await video.current.play().catch(() => {})
      })
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
    <div className="space-y-2">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted text-sm text-muted-foreground">
        {live ? <video ref={video} playsInline muted className="h-full w-full object-cover" />
          : url ? <img src={url} alt="Foto wajah" className="h-full w-full object-cover" />
          : 'Belum ada foto'}
      </div>
      <div className="flex flex-wrap gap-2">
        {live
          ? <Button type="button" onClick={shoot}><Camera /> Ambil foto</Button>
          : <Button type="button" variant="outline" onClick={open}><Camera /> {photo ? 'Foto ulang' : 'Buka kamera'}</Button>}
        <Button type="button" variant="outline" asChild>
          <label className="cursor-pointer"><Upload /> Unggah foto
            <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={onFile} />
          </label>
        </Button>
      </div>
    </div>
  )
}
