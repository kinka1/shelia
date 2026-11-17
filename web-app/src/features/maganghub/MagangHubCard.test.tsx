import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MagangHubCard } from './MagangHubCard'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
const stub = (rows: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('/daily-logs') ? json({ data: rows, total: rows.length }) : json({ data: [] }))))
const L = 'x'.repeat(100)
// Every card needs a MagangHub token: the form sends to the real MagangHub.
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

  it('no longer shows or sends a Lokasi field', () => {
    opened()
    render(<MagangHubCard />)
    expect(screen.queryByLabelText('Lokasi')).toBeNull()
  })
})
