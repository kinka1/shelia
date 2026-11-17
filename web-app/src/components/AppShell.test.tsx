import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { SessionProvider } from '@/features/session/SessionProvider'
import { saveSession } from '@/lib/shelia'
import { stubExt } from '@/test/ext'

describe('AppShell', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('shows the rail links and marks the current page', () => {
    saveSession('t', { full_name: 'Budi', nik: '123', branch_name: 'Surabaya' })
    render(
      <MemoryRouter initialEntries={['/log-api']}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </MemoryRouter>,
    )
    for (const name of ['Absen', 'Riwayat Shelia', 'Riwayat MagangHub', 'Log API']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Log API' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Log API' })).toBeVisible()
  })

  it('opens without a Shelia login: Absen shows the login in the Shelia card, MagangHub still there', async () => {
    localStorage.clear()
    const f = vi.fn(async (_u: string) => new Response(JSON.stringify({ data: [] })))
    vi.stubGlobal('fetch', f)
    render(<MemoryRouter initialEntries={['/']}><SessionProvider><App /></SessionProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Masuk ke Shelia' })).toBeInTheDocument()
    expect(screen.getByLabelText('NIK')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'MagangHub' })).toBeInTheDocument()
    expect(screen.getByText('Belum login')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Menu akun' })).toBeNull()
    expect(f.mock.calls.some(([u]) => String(u).startsWith('/api/'))).toBe(false)
  })

  it('Riwayat Shelia, like Riwayat MagangHub, points to the login on Absen', () => {
    localStorage.clear()
    localStorage.setItem('shelia.history', JSON.stringify([{ date: '2026-11-16', shift: 'Pagi', checkIn: '08:00', checkOut: '17:00', status: 'hadir' }]))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    render(<MemoryRouter initialEntries={['/riwayat-shelia']}><SessionProvider><App /></SessionProvider></MemoryRouter>)
    expect(screen.getByText('Shelia belum login')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Login di halaman Absen' })).toHaveAttribute('href', '/')
    expect(screen.queryByLabelText('NIK')).toBeNull()
    expect(screen.queryByText('Pagi')).toBeNull()
  })

  it('Shelia card shows Terhubung and Keluar; the profile menu has no Keluar', async () => {
    saveSession('t', { full_name: 'Budi', nik: '123', branch_name: 'Surabaya' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { next_action: 'none', sessions: [] } }))))
    render(<MemoryRouter initialEntries={['/']}><SessionProvider><App /></SessionProvider></MemoryRouter>)
    const shelia = (await screen.findByRole('heading', { name: 'Shelia' })).closest('section')!
    expect(within(shelia).getByText('Terhubung')).toBeInTheDocument()
    expect(within(shelia).getByRole('button', { name: 'Muat ulang status' })).toHaveTextContent('Muat ulang status')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Menu akun' }), { button: 0, ctrlKey: false })
    expect(await screen.findByText('Budi')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Keluar' })).toBeNull()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.click(within(shelia).getByRole('button', { name: 'Keluar' }))
    expect(await screen.findByLabelText('NIK')).toBeInTheDocument()
  })

  it('the top status follows MagangHub Keluar and Hubungkan', async () => {
    localStorage.clear()
    localStorage.setItem('maganghub.token', 'mh-tok')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [], total: 0 }))))
    stubExt((m) => (m.type === 'hello' ? { ok: true, version: '1.1.0' } : { ok: true, token: 'again' }))
    render(<MemoryRouter initialEntries={['/']}><SessionProvider><App /></SessionProvider></MemoryRouter>)
    expect(await screen.findByText('Belum diisi')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Keluar' }))
    expect(await screen.findByText('Belum terhubung', { selector: 'p' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Hubungkan MagangHub' }))
    expect(await screen.findByText('Belum diisi')).toBeInTheDocument()
  })

  it('Shelia card: no Sesi box, but keeps the check-out window and the HR review note', async () => {
    saveSession('t', { full_name: 'Budi' })
    const today = { next_action: 'check_out', status: 'checked_in', work_date: '2026-11-17', sessions: [{
      session_no: 1, state: 'open', work_date: '2026-11-17', check_in_time: '2026-11-17 07:55:00', needs_hr_review: true,
      shift: { name: 'Pagi', check_out_start_at: '2026-11-17 16:00:00', check_out_end_at: '2026-11-17 18:00:00' },
    }] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: today }))))
    render(<MemoryRouter initialEntries={['/']}><SessionProvider><App /></SessionProvider></MemoryRouter>)
    expect(await screen.findByText(/Check-out mulai/)).toBeInTheDocument()
    expect(screen.getByText(/Menunggu pemeriksaan HR/)).toBeInTheDocument()
    expect(screen.queryByText(/Sesi 1/)).toBeNull()
  })

  it('Muat ulang status greys out and locks the Shelia card until it finishes', async () => {
    saveSession('t', { full_name: 'Budi' })
    let hold: ((r: Response) => void) | null = null
    const body = () => new Response(JSON.stringify({ data: { next_action: 'none', sessions: [] } }))
    vi.stubGlobal('fetch', vi.fn(() => (hold === null ? Promise.resolve(body()) : new Promise<Response>((r) => { hold = r }))))
    render(<MemoryRouter initialEntries={['/']}><SessionProvider><App /></SessionProvider></MemoryRouter>)
    const shelia = (await screen.findByRole('heading', { name: 'Shelia' })).closest('section')!
    await within(shelia).findByRole('button', { name: 'Muat ulang status' })
    hold = () => {}
    fireEvent.click(within(shelia).getByRole('button', { name: 'Muat ulang status' }))
    await waitFor(() => expect(shelia.querySelector('[inert]')).not.toBeNull())
    expect(shelia.querySelector('[inert]')!.className).toMatch(/opacity/)
    hold!(body())
    await waitFor(() => expect(shelia.querySelector('[inert]')).toBeNull())
  })
})
