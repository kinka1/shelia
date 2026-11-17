import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorText, type ApiError } from '@/lib/shelia'
import { useSession } from './SessionProvider'

export default function LoginPage() {
  const { login, expiredMessage } = useSession()
  const [nik, setNik] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const u = nik.trim()
    if (!u || !pw) return setError('NIK dan password wajib diisi.')
    setError('')
    setBusy(true)
    try {
      await login(u, pw)
    } catch (err) {
      setError(errorText(err as ApiError))
    } finally {
      setBusy(false)
    }
  }

  const message = error || expiredMessage
  return (
    <div className="max-w-sm">
      <h2 className="mb-3 text-[15px] font-semibold">Masuk ke Shelia</h2>
      <div>
        <div>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {message && (
              <div
                role="alert"
                className={`whitespace-pre-line rounded-md px-3 py-2 text-sm ${
                  error ? 'bg-destructive/10 text-destructive-ink' : 'bg-primary/10 text-primary-ink'
                }`}
              >
                {message}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nik">NIK</Label>
              <Input id="nik" autoComplete="username" value={nik} onChange={(e) => setNik(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pr-10"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
                  onClick={() => setShow((s) => !s)}
                >
                  {show ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Memproses…' : 'Masuk'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
