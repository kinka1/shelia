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
    for (const name of ['Absen', 'Riwayat', 'Log API']) {
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

  it('one Riwayat item; the old Riwayat links open the combined page', async () => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    for (const old of ['/riwayat-shelia', '/riwayat-maganghub']) {
      const { unmount } = render(<MemoryRouter initialEntries={[old]}><SessionProvider><App /></SessionProvider></MemoryRouter>)
      expect(screen.getByRole('heading', { level: 1, name: 'Riwayat' })).toBeInTheDocument()
      expect(await screen.findByText('Shelia belum login')).toBeInTheDocument()
      unmount()
    }
    render(<MemoryRouter initialEntries={['/']}><SessionProvider><App /></SessionProvider></MemoryRouter>)
    const links = screen.getAllByRole('link').filter((l) => /riwayat/i.test(l.getAttribute('href') ?? ''))
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['Riwayat', '/riwayat']])
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

describe('AppShell: Telegram reminder', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
  const INVITE = 'https://t.me/+example'
  const me = (o = {}) => ({ name: 'Budi', shelia: true, maganghub: false, admin: false, holiday: false, invite: INVITE, ...o })
  function stubMe(body: unknown, status = 200) {
    const f = vi.fn(async (u: string, init?: RequestInit) =>
      String(u) === '/remind-api/me' && !init?.method ? new Response(JSON.stringify(body), { status })
        : init?.method === 'PUT' ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ data: [] })))
    vi.stubGlobal('fetch', f)
    return f
  }
  const ui = (path = '/log-api') => render(<MemoryRouter initialEntries={[path]}><SessionProvider><App /></SessionProvider></MemoryRouter>)
  const openMenu = async () => {
    const t = await screen.findByRole('button', { name: 'Menu akun' })
    fireEvent.pointerDown(t, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    return screen.findByRole('menu')
  }

  it('sidebar footer opens the channel and copies its link', async () => {
    saveSession('t', { full_name: 'Budi' })
    stubMe(me())
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    ui()
    const nav = screen.getByRole('navigation', { name: 'Menu utama' })
    const link = await within(nav).findByRole('link', { name: /Channel Telegram/ })
    expect(link).toHaveAttribute('href', INVITE)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(within(nav).getByRole('button', { name: 'Salin link channel' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(INVITE))
  })

  it('no invite, or the reminder service off: no channel footer', async () => {
    saveSession('t', { full_name: 'Budi' })
    const f = stubMe({}, 502)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ui()
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u) === '/remind-api/me')).toBe(true))
    expect(screen.queryByRole('link', { name: /Channel Telegram/ })).toBeNull()
  })

  it('profile menu shows the reminder status; Libur hari ini only for admins', async () => {
    saveSession('t', { full_name: 'Budi' })
    stubMe(me())
    ui()
    const menu = await openMenu()
    expect(within(menu).getByText('Pengingat Telegram')).toBeInTheDocument()
    expect(within(menu).getByText('Shelia ✅ · MagangHub –')).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitemcheckbox', { name: 'Libur hari ini' })).toBeNull()
  })

  it('admin toggles Libur hari ini from the profile menu', async () => {
    saveSession('t', { full_name: 'Budi' })
    const f = stubMe(me({ admin: true }))
    ui()
    const menu = await openMenu()
    const item = within(menu).getByRole('menuitemcheckbox', { name: 'Libur hari ini' })
    expect(item).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(item)
    await waitFor(() => expect(f.mock.calls.some(([u, i]) => u === '/remind-api/holiday' && (i as RequestInit).method === 'PUT')).toBe(true))
  })

  it('the Absen page no longer has the Pengingat Telegram card', async () => {
    saveSession('t', { full_name: 'Budi' })
    stubExt(() => null)
    stubMe(me())
    ui('/')
    await screen.findByRole('link', { name: /Channel Telegram/ })
    expect(screen.queryByRole('heading', { name: /Pengingat Telegram/ })).toBeNull()
  })
})
