import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { SessionProvider } from '@/features/session/SessionProvider'
import { saveSession } from '@/lib/shelia'

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
})
