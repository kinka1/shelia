import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MagangHubCard } from './MagangHubCard'
import { stubExt } from '@/test/ext'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
const L = 'x'.repeat(100)
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const fill = () => { for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByRole('textbox', { name: n }), { target: { value: L } }) }
/** MagangHub reads (fetch) answer with these rows; the extension answers `answer` for token/send. */
function setup({ rows = [] as unknown[], answer = (_m: any): any => ({ ok: true, status: 201 }), installed = true, status = 200 } = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => (status === 200 ? json({ data: rows, total: rows.length }) : json({}, status))))
  return installed ? stubExt((m) => (m.type === 'hello' ? { ok: true, version: '1.1.0' } : answer(m))) : null
}
const sends = (s: ReturnType<typeof setup>) => s!.mock.calls.filter(([, m]) => m.type === 'send').map(([, m]) => m.body)
const kirim = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Kirim log' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Kirim ke MagangHub' }))
}

beforeEach(() => localStorage.setItem('maganghub.token', 'mh-tok'))
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('MagangHubCard form', () => {
  it('gates Kirim log on 100 chars per field', async () => {
    setup()
    render(<MagangHubCard />)
    const btn = screen.getByRole('button', { name: 'Kirim log' })
    expect(await screen.findByText('Lengkapi 3 isian lagi')).toBeInTheDocument()
    expect(btn).toBeDisabled()
    fill()
    await waitFor(() => expect(btn).toBeEnabled())
  })

  it('shows sent state when today already has a log', async () => {
    setup({ rows: [{ date: TODAY, created_at: '2026-11-17T08:01:00' }] })
    render(<MagangHubCard />)
    expect(await screen.findByText('Terkirim 08:01')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Aktivitas' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Lihat' }))
    expect(screen.getByRole('textbox', { name: 'Aktivitas' })).toBeDisabled()
  })

  it('locks the date to today and has no Lokasi field', () => {
    setup()
    render(<MagangHubCard />)
    expect(screen.getByLabelText('Tanggal')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('Lokasi')).toBeNull()
  })

  it('shows the coordinates exactly as sent, not rounded', () => {
    setup()
    render(<MagangHubCard />)
    expect(screen.getByLabelText('Latitude')).toHaveValue('-7.308430344545027')
    expect(screen.getByLabelText('Longitude')).toHaveValue('112.785199930883')
  })
})

describe('MagangHubCard sending', () => {
  it('sends the office coordinates by default, in one click, once', async () => {
    let finish: (r: any) => void = () => {}
    const s = setup({ answer: (m) => (m.type === 'send' ? new Promise((r) => { finish = r }) : { ok: true, token: 'x' }) })
    render(<MagangHubCard />)
    fill(); await kirim()
    const btn = screen.getByRole('button', { name: /Mengirim|Kirim ke MagangHub/ })
    fireEvent.click(btn)
    await waitFor(() => expect(sends(s)).toHaveLength(1))
    expect(sends(s)[0]).toEqual({ date: TODAY, status: 'PRESENT', activity_log: L, lesson_learned: L, obstacles: L, latitude: -7.308430344545027, longitude: 112.785199930883 })
    finish({ ok: true, status: 201 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('sends the device GPS position when used', async () => {
    const s = setup()
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: -7.25, longitude: 112.75, accuracy: 18 } } as GeolocationPosition) } })
    render(<MagangHubCard />)
    fireEvent.click(screen.getByRole('button', { name: /Gunakan lokasi saya/ }))
    expect(await screen.findByText(/akurasi ± 18 m/)).toBeInTheDocument()
    fill(); await kirim()
    await waitFor(() => expect(sends(s)[0]).toMatchObject({ latitude: -7.25, longitude: 112.75 }))
  })

  it('cancel sends nothing, and nothing ever goes to our server', async () => {
    const s = setup()
    render(<MagangHubCard />)
    fill()
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim log' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Hadir')
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sends(s)).toHaveLength(0)
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    expect(f.mock.calls.every(([, i]) => !i || !(i as RequestInit).method || (i as RequestInit).method === 'GET')).toBe(true)
  })

  it('shows MagangHub\'s refusal, and the login hint', async () => {
    let answer: any = { error: 'http', status: 422, message: 'Aktivitas terlalu pendek' }
    setup({ answer: (m) => (m.type === 'send' ? answer : { ok: true, token: 'x' }) })
    render(<MagangHubCard />)
    fill(); await kirim()
    expect(await screen.findByRole('alert')).toHaveTextContent('Aktivitas terlalu pendek')
    answer = { error: 'login' }
    fireEvent.click(screen.getByRole('button', { name: 'Kirim ke MagangHub' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Login MagangHub'))
  })
})

describe('MagangHubCard gates', () => {
  it('without the extension: cannot send, asks to install it', async () => {
    setup({ installed: false })
    render(<MagangHubCard />)
    fill()
    expect(await screen.findByText('Pasang ekstensi dulu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kirim log' })).toBeDisabled()
  })

  it('without a token (and none from the extension): cannot send', async () => {
    localStorage.removeItem('maganghub.token')
    setup({ answer: () => ({ error: 'login' }) })
    render(<MagangHubCard />)
    fill()
    expect(await screen.findByText('Sambungkan MagangHub dulu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kirim log' })).toBeDisabled()
  })

  it('with an expired token: cannot send', async () => {
    setup({ status: 401, answer: () => ({ error: 'login' }) })
    render(<MagangHubCard />)
    fill()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kirim log' })).toBeDisabled())
  })

  it('refreshes a missing token silently on load', async () => {
    localStorage.removeItem('maganghub.token')
    const s = setup({ answer: () => ({ ok: true, token: 'fresh' }) })
    render(<MagangHubCard />)
    await waitFor(() => expect(localStorage.getItem('maganghub.token')).toBe('fresh'))
    expect(s).toHaveBeenCalledWith(expect.any(String), { type: 'token', interactive: false }, expect.any(Function))
  })
})
