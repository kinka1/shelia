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

  it('maps 422 errors to fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i?: RequestInit) =>
      i?.method === 'POST' ? json({ message: 'x', errors: { obstacles: 'obstacles minimal 100 karakter' } }, 422) : json({ data: [] })))
    render(<MagangHubCard />)
    for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByRole('textbox', { name: n }), { target: { value: L } })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim log' })); fireEvent.click(await screen.findByRole('button', { name: 'Kirim ke MagangHub' }))
    expect(await screen.findByText('Minimal 100 karakter')).toBeInTheDocument()
  })

  it('shows a message when 409 finds no row on re-check', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i?: RequestInit) =>
      i?.method === 'POST' ? json({ message: 'Absensi untuk tanggal ini sudah ada' }, 409) : json({ data: [] })))
    render(<MagangHubCard />)
    for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByRole('textbox', { name: n }), { target: { value: L } })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim log' })); fireEvent.click(await screen.findByRole('button', { name: 'Kirim ke MagangHub' }))
    expect(await screen.findByText('Log untuk tanggal ini sudah ada.')).toBeInTheDocument()
  })
})

describe('MagangHubCard stale check', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('ignores a slower response for a previous date', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    // Hold every request made for the first date (the check and the token probe), answer the new date at once.
    const held: ((r: Response) => void)[] = []
    let changed = false
    vi.stubGlobal('fetch', vi.fn(() => (changed ? Promise.resolve(json({ data: [] })) : new Promise<Response>((r) => { held.push(r) }))))
    render(<MagangHubCard />)
    await waitFor(() => expect(held.length).toBeGreaterThan(0))
    changed = true
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2020-01-01' } })
    await new Promise((r) => setTimeout(r, 10))
    for (const r of held) r(json({ data: [{ date: today, created_at: today + 'T08:01:00' }] }))
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText('Terkirim 08:01')).toBeNull()
  })
})

describe('MagangHubCard location', () => {
  afterEach(() => vi.unstubAllGlobals())
  const sent = () => {
    const posts: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i?: RequestInit) => {
      if (i?.method === 'POST') { posts.push(JSON.parse(String(i.body))); return json({}, 201) }
      return json({ data: [] })
    }))
    return posts
  }
  const fill = () => { for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByRole('textbox', { name: n }), { target: { value: L } }) }

  it('sends the office coordinates by default', async () => {
    const posts = sent()
    render(<MagangHubCard />)
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' })); fireEvent.click(await screen.findByRole('button', { name: 'Kirim ke MagangHub' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ latitude: -7.308430344545027, longitude: 112.785199930883, status: 'PRESENT' })
  })

  it('fills latitude and longitude from the device GPS', async () => {
    const posts = sent()
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: -7.25, longitude: 112.75, accuracy: 18 } } as GeolocationPosition) } })
    render(<MagangHubCard />)
    fireEvent.click(screen.getByRole('button', { name: /Gunakan lokasi saya/ }))
    expect(await screen.findByText(/akurasi ± 18 m/)).toBeInTheDocument()
    expect(screen.getByLabelText('Latitude')).toHaveValue('-7.25')
    expect(screen.getByLabelText('Longitude')).toHaveValue('112.75')
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' })); fireEvent.click(await screen.findByRole('button', { name: 'Kirim ke MagangHub' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ latitude: -7.25, longitude: 112.75 })
  })
})

it('shows the coordinates exactly as sent, not rounded', () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ data: [] })))
  render(<MagangHubCard />)
  expect(screen.getByLabelText('Latitude')).toHaveValue('-7.308430344545027')
  expect(screen.getByLabelText('Longitude')).toHaveValue('112.785199930883')
  vi.unstubAllGlobals()
})

describe('MagangHubCard real send safety', () => {
  afterEach(() => vi.unstubAllGlobals())
  const posts: any[] = []
  beforeEach(() => {
    posts.length = 0
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i?: RequestInit) => {
      if (i?.method === 'POST') { posts.push(JSON.parse(String(i.body))); return json({}, 201) }
      return json({ data: [] })
    }))
  })
  const fill = () => { for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByRole('textbox', { name: n }), { target: { value: L } }) }

  it('asks before sending and sends nothing when cancelled', async () => {
    render(<MagangHubCard />)
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    const dlg = await screen.findByRole('dialog')
    expect(dlg).toHaveTextContent('Kirim ke MagangHub?')
    expect(dlg).toHaveTextContent('Hadir')
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts).toHaveLength(0)
  })

  it('cannot send without a MagangHub token', async () => {
    localStorage.removeItem('maganghub.token')
    render(<MagangHubCard />)
    fill()
    expect(screen.getByRole('button', { name: 'Kirim log' })).toBeDisabled()
    expect(screen.getByText('Sambungkan MagangHub dulu')).toBeInTheDocument()
  })

  it('no longer shows or sends a Lokasi field', () => {
    render(<MagangHubCard />)
    expect(screen.queryByLabelText('Lokasi')).toBeNull()
  })
})
