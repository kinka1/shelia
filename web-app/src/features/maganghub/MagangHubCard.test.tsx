import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MagangHubCard } from './MagangHubCard'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
const stub = (rows: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('/monev-api/') ? json({ data: rows, total: rows.length }) : json({ data: [] }))))
const L = 'x'.repeat(100)

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
    stub([{ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()), clock_in: '08:01' }])
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
    fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    expect(await screen.findByText('Minimal 100 karakter')).toBeInTheDocument()
  })

  it('shows a message when 409 finds no row on re-check', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i?: RequestInit) =>
      i?.method === 'POST' ? json({ message: 'Absensi untuk tanggal ini sudah ada' }, 409) : json({ data: [] })))
    render(<MagangHubCard />)
    for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByRole('textbox', { name: n }), { target: { value: L } })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    expect(await screen.findByText('Log untuk tanggal ini sudah ada.')).toBeInTheDocument()
  })
})

describe('MagangHubCard stale check', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('ignores a slower response for a previous date', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    let slow!: (r: Response) => void
    let n = 0
    vi.stubGlobal('fetch', vi.fn(() => (++n === 1 ? new Promise<Response>((r) => { slow = r }) : Promise.resolve(json({ data: [] })))))
    render(<MagangHubCard />)
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2020-01-01' } })
    await waitFor(() => expect(n).toBe(2))
    slow(json({ data: [{ date: today, clock_in: '08:01' }] }))
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
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ latitude: -7.308430344545027, longitude: 112.785199930883, location: 'Surabaya' })
  })

  it('fills latitude and longitude from the device GPS', async () => {
    const posts = sent()
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: -7.25, longitude: 112.75, accuracy: 18 } } as GeolocationPosition) } })
    render(<MagangHubCard />)
    fireEvent.click(screen.getByRole('button', { name: /Gunakan lokasi saya/ }))
    expect(await screen.findByText(/akurasi ± 18 m/)).toBeInTheDocument()
    expect(screen.getByLabelText('Latitude')).toHaveValue('-7.25')
    expect(screen.getByLabelText('Longitude')).toHaveValue('112.75')
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
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
