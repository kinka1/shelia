import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
})
