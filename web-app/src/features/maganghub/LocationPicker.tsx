import { useEffect, useRef, useState } from 'react'
import { Undo2 } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CONFIG } from '@/lib/shelia'

export type LatLng = { lat: number; lng: number }
export const OFFICE: LatLng = { lat: CONFIG.LAT, lng: CONFIG.LNG }

/** The point moved 1-5 m in a random direction, so no two sends carry the exact same coordinates. */
export function jitter(p: LatLng, rand = Math.random): LatLng {
  const d = 1 + rand() * 4, a = rand() * 2 * Math.PI
  return { lat: p.lat + (d * Math.cos(a)) / 111320, lng: p.lng + (d * Math.sin(a)) / (111320 * Math.cos((p.lat * Math.PI) / 180)) }
}

const LABEL = 'text-xs font-semibold text-muted-foreground'
const READ_ONLY = 'bg-muted text-muted-foreground tabular-nums focus-visible:ring-0'
const GEO_ERROR: Record<number, string> = {
  1: 'Izin lokasi ditolak. Izinkan lokasi di pengaturan browser, atau geser pin di peta.',
  2: 'Lokasi perangkat tidak tersedia. Geser pin di peta.',
  3: 'Lokasi terlalu lama didapat. Coba lagi, atau geser pin di peta.',
}

/** Peta OpenStreetMap dengan pin yang bisa digeser; GPS perangkat mengisi titiknya. */
export function LocationPicker({ value, onChange, disabled }: { value: LatLng; onChange: (v: LatLng) => void; disabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<{ map: any; pin: any } | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoErr, setGeoErr] = useState('')

  // Peta dibuat sekali; Leaflet dimuat terpisah supaya bundle utama tetap kecil.
  useEffect(() => {
    let dead = false
    void import('leaflet').then(({ default: L }) => {
      if (dead || !box.current) return
      const m = L.map(box.current, { center: [value.lat, value.lng], zoom: 16, scrollWheelZoom: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
        referrerPolicy: 'strict-origin-when-cross-origin', // OSM menolak permintaan tanpa Referer
      }).addTo(m)
      const icon = L.divIcon({ className: '', html: '<span class="map-pin"></span>', iconSize: [22, 22], iconAnchor: [11, 22] })
      const pin = L.marker([value.lat, value.lng], { icon, draggable: !disabled, keyboard: true, title: 'Titik lokasi' }).addTo(m)
      const set = (ll: { lat: number; lng: number }) => { setAccuracy(null); change.current({ lat: ll.lat, lng: ll.lng }) }
      pin.on('dragend', () => set(pin.getLatLng()))
      m.on('click', (e: any) => { if (pin.dragging?.enabled()) set(e.latlng) })
      map.current = { map: m, pin }
    })
    return () => { dead = true; map.current?.map.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Titik berubah dari luar (GPS, tombol kantor) → pin dan peta ikut.
  useEffect(() => {
    const m = map.current
    if (!m) return
    m.pin.setLatLng([value.lat, value.lng])
    m.map.panTo([value.lat, value.lng])
  }, [value.lat, value.lng])

  useEffect(() => {
    const d = map.current?.pin.dragging
    if (d) disabled ? d.disable() : d.enable()
  }, [disabled])

  function locate() {
    if (!navigator.geolocation) return setGeoErr('Browser ini tidak mendukung GPS. Geser pin di peta.')
    setLocating(true); setGeoErr('')
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); onChange({ lat: p.coords.latitude, lng: p.coords.longitude }); setAccuracy(Math.round(p.coords.accuracy)) },
      (e) => { setLocating(false); setGeoErr(GEO_ERROR[e.code] ?? 'Lokasi gagal didapat.') },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  const atOffice = value.lat === OFFICE.lat && value.lng === OFFICE.lng
  return (
    <div className="mb-2.5 space-y-1.5">
      <p className={LABEL}>Titik lokasi</p>
      <div ref={box} role="application" aria-label="Peta lokasi, geser pin untuk memilih titik" className="isolate h-[180px] overflow-hidden rounded-md border bg-muted" />
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-6 rounded-md px-2 text-xs font-semibold" disabled={locating} onClick={locate}>
            {locating ? 'Mencari lokasi…' : 'Gunakan lokasi saya'}
          </Button>
          {!atOffice && (
            <Button type="button" variant="ghost" onClick={() => { setAccuracy(null); onChange(OFFICE) }}>
              <Undo2 /> Kantor
            </Button>
          )}
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {accuracy != null ? `akurasi ± ${accuracy} m` : atOffice ? 'Titik kantor Surabaya' : 'Titik dipilih di peta'}
          </span>
        </div>
      )}
      {geoErr && <p role="alert" className="text-xs text-destructive-ink">{geoErr}</p>}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <Label htmlFor="mh-lat" className={LABEL}>Latitude</Label>
          <Input id="mh-lat" value={String(value.lat)} readOnly aria-readonly className={READ_ONLY} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mh-lng" className={LABEL}>Longitude</Label>
          <Input id="mh-lng" value={String(value.lng)} readOnly aria-readonly className={READ_ONLY} />
        </div>
      </div>
    </div>
  )
}
