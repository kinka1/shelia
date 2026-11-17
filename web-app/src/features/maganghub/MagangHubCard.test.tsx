import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MagangHubCard } from './MagangHubCard'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
const stub = (rows: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('/daily-logs') ? json({ data: rows, total: rows.length }) : json({ data: [] }))))
const L = 'x'.repeat(100)
// Every card needs a MagangHub token: the form sends to the real MagangHub.
import { stubExt } from '@/test/ext'

beforeEach(() => localStorage.setItem('maganghub.token', 'mh-tok'))

describe('MagangHubCard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('gates submit on 100 chars per field', async () => {
    stub([])
    render(<MagangHubCard />)
    const send = screen.getByRole('button', { name: 'Kirim log' })
    expect(send).toBeDisabled()
    expect(await screen.findByText('Lengkapi 3 isian lagi')).toBeInTheDocument()
    for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByRole('textbox', { name: n }), { target: { value: L } })
    expect(send).toBeEnabled()
  })

  it('shows sent state when today already has a log', async () => {
    stub([{ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()), created_at: '2026-11-17T08:01:00' }])
    render(<MagangHubCard />)
    expect(await screen.findByText('Terkirim 08:01')).toBeInTheDocument()
    // Bagian yang selesai dilipat jadi satu baris; Lihat membukanya lagi.
    expect(screen.queryByRole('textbox', { name: 'Aktivitas' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Lihat' }))
    expect(screen.getByRole('textbox', { name: 'Aktivitas' })).toBeDisabled()
  })


})

it('locks the date to today', () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ data: [] })))
  render(<MagangHubCard />)
  const f = screen.getByLabelText('Tanggal')
  expect(f).toHaveAttribute('readonly')
  expect(f).not.toHaveAttribute('type', 'date')
  vi.unstubAllGlobals()
})

// The log is sent from MagangHub's page by the bookmark; here we check what the link we open carries.
const opened = () => {
  const urls: string[] = []
  vi.stubGlobal('open', vi.fn((u: string) => { urls.push(u); return null }))
  vi.stubGlobal('fetch', vi.fn(async () => json({ data: [] })))
  return urls
}
const payload = (u: string) => JSON.parse(decodeURIComponent(new URL(u).hash.slice('#shelia-log='.length)))
const fill = () => { for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByRole('textbox', { name: n }), { target: { value: L } }) }
const openMh = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Buka MagangHub' }))
}

describe('MagangHubCard location', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the office coordinates by default', async () => {
    const urls = opened()
    render(<MagangHubCard />)
    fill(); await openMh()
    expect(urls).toHaveLength(1)
    expect(new URL(urls[0]).origin).toBe('https://monev.maganghub.kemnaker.go.id')
    expect(payload(urls[0])).toMatchObject({ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()), status: 'PRESENT', latitude: -7.308430344545027, longitude: 112.785199930883 })
  })

  it('fills latitude and longitude from the device GPS', async () => {
    const urls = opened()
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: -7.25, longitude: 112.75, accuracy: 18 } } as GeolocationPosition) } })
    render(<MagangHubCard />)
    fireEvent.click(screen.getByRole('button', { name: /Gunakan lokasi saya/ }))
    expect(await screen.findByText(/akurasi ± 18 m/)).toBeInTheDocument()
    expect(screen.getByLabelText('Latitude')).toHaveValue('-7.25')
    expect(screen.getByLabelText('Longitude')).toHaveValue('112.75')
    fill(); await openMh()
    expect(payload(urls[0])).toMatchObject({ latitude: -7.25, longitude: 112.75 })
  })
})

it('shows the coordinates exactly as sent, not rounded', () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ data: [] })))
  render(<MagangHubCard />)
  expect(screen.getByLabelText('Latitude')).toHaveValue('-7.308430344545027')
  expect(screen.getByLabelText('Longitude')).toHaveValue('112.785199930883')
  vi.unstubAllGlobals()
})

describe('MagangHubCard send via MagangHub', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows what will be sent and opens nothing when cancelled', async () => {
    const urls = opened()
    render(<MagangHubCard />)
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    const dlg = await screen.findByRole('dialog')
    expect(dlg).toHaveTextContent('Kirim lewat MagangHub')
    expect(dlg).toHaveTextContent('Hadir')
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(urls).toHaveLength(0)
  })

  it('offers the → Kirim log bookmark with a working javascript: link', async () => {
    opened()
    render(<MagangHubCard />)
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    const a = await screen.findByRole('link', { name: '→ Kirim log' })
    expect(a.getAttribute('href')).toMatch(/^javascript:\(function/)
  })

  it('sends nothing to our server', async () => {
    const urls = opened()
    render(<MagangHubCard />)
    fill(); await openMh()
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    expect(f.mock.calls.every(([, i]) => !i || (i as RequestInit).method === undefined || (i as RequestInit).method === 'GET')).toBe(true)
    expect(urls).toHaveLength(1)
  })

  it('cannot send without a working MagangHub token', async () => {
    const urls = opened()
    localStorage.removeItem('maganghub.token')
    render(<MagangHubCard />)
    fill()
    const btn = screen.getByRole('button', { name: 'Kirim log' })
    expect(btn).toBeDisabled()
    expect(screen.getByText('Sambungkan MagangHub dulu')).toBeInTheDocument()
    fireEvent.submit(btn.closest('form')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(urls).toHaveLength(0)
  })

  it('cannot send with an expired token', async () => {
    opened()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    render(<MagangHubCard />)
    fill()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kirim log' })).toBeDisabled())
  })

  it('no longer shows or sends a Lokasi field', () => {
    opened()
    render(<MagangHubCard />)
    expect(screen.queryByLabelText('Lokasi')).toBeNull()
  })
})

describe('MagangHubCard with the extension', () => {
  afterEach(() => vi.unstubAllGlobals())
  const ext = (answer: (m: any) => any) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [] })))
    vi.stubGlobal('open', vi.fn())
    return stubExt((m) => (m.type === 'hello' ? { ok: true, version: '1.0.0' } : answer(m)))
  }

  it('sends in one click, once, and closes the dialog', async () => {
    let finish: (r: any) => void = () => {}
    const send = ext((m) => (m.type === 'send' ? new Promise((r) => { finish = r }) : { ok: true, token: 'x' }))
    render(<MagangHubCard />)
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    const btn = await screen.findByRole('button', { name: 'Kirim ke MagangHub' })
    expect(screen.queryByRole('link', { name: '→ Kirim log' })).toBeNull()
    fireEvent.click(btn); fireEvent.click(btn)
    await waitFor(() => expect(send.mock.calls.filter(([, m]) => m.type === 'send')).toHaveLength(1))
    const body = send.mock.calls.find(([, m]) => m.type === 'send')![1].body
    expect(body).toMatchObject({ status: 'PRESENT', activity_log: L, latitude: -7.308430344545027 })
    finish({ ok: true, status: 201 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.open).not.toHaveBeenCalled()
  })

  it('shows MagangHub\'s refusal, and the login hint', async () => {
    let answer: any = { error: 'http', status: 422, message: 'Aktivitas terlalu pendek' }
    ext((m) => (m.type === 'send' ? answer : { ok: true, token: 'x' }))
    render(<MagangHubCard />)
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim ke MagangHub' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Aktivitas terlalu pendek')
    answer = { error: 'login' }
    fireEvent.click(screen.getByRole('button', { name: 'Kirim ke MagangHub' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Login MagangHub'))
  })

  it('refreshes a missing token silently on load', async () => {
    localStorage.removeItem('maganghub.token')
    const send = ext(() => ({ ok: true, token: 'fresh' }))
    render(<MagangHubCard />)
    await waitFor(() => expect(localStorage.getItem('maganghub.token')).toBe('fresh'))
    expect(send).toHaveBeenCalledWith(expect.any(String), { type: 'token', interactive: false }, expect.any(Function))
  })
})
