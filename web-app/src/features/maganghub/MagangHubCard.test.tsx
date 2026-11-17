import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Toaster, toast } from 'sonner'
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
    await screen.findByLabelText('Tanggal')
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
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull()
  })

  it('locks the date to today and has no Lokasi field', async () => {
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    expect(screen.getByLabelText('Tanggal')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('Lokasi')).toBeNull()
  })

  it('shows the coordinates exactly as sent, not rounded', async () => {
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    expect(screen.getByLabelText('Latitude')).toHaveValue('-7.308430344545027')
    expect(screen.getByLabelText('Longitude')).toHaveValue('112.785199930883')
  })
})

describe('MagangHubCard sending', () => {
  it('sends the office coordinates by default, in one click, once', async () => {
    let finish: (r: any) => void = () => {}
    const s = setup({ answer: (m) => (m.type === 'send' ? new Promise((r) => { finish = r }) : { ok: true, token: 'x' }) })
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fill(); await kirim()
    const btn = screen.getByRole('button', { name: /Mengirim|Kirim ke MagangHub/ })
    fireEvent.click(btn)
    await waitFor(() => expect(sends(s)).toHaveLength(1))
    expect(sends(s)[0]).toEqual({ date: TODAY, status: 'PRESENT', activity_log: L, lesson_learned: L, obstacles: L, latitude: -7.308430344545027, longitude: 112.785199930883 })
    finish({ ok: true, status: 201 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(localStorage.getItem('maganghub.draft')).toBeNull() // sent: the draft is gone
  })

  it('sends the device GPS position when used', async () => {
    const s = setup()
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: -7.25, longitude: 112.75, accuracy: 18 } } as GeolocationPosition) } })
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fireEvent.click(screen.getByRole('button', { name: /Gunakan lokasi saya/ }))
    expect(await screen.findByText(/akurasi ± 18 m/)).toBeInTheDocument()
    fill(); await kirim()
    await waitFor(() => expect(sends(s)[0]).toMatchObject({ latitude: -7.25, longitude: 112.75 }))
  })

  it('cancel sends nothing, and nothing ever goes to our server', async () => {
    const s = setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
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
    await screen.findByLabelText('Tanggal')
    fill(); await kirim()
    expect(await screen.findByRole('alert')).toHaveTextContent('Aktivitas terlalu pendek')
    answer = { error: 'login' }
    fireEvent.click(screen.getByRole('button', { name: 'Kirim ke MagangHub' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Login MagangHub'))
  })
})

describe('MagangHubCard gates', () => {
  it('Keluar forgets the MagangHub token and does not fetch it back silently', async () => {
    const s = setup({ answer: () => ({ ok: true, token: 'again' }) })
    render(<MagangHubCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Keluar' }))
    expect(await screen.findByRole('button', { name: 'Hubungkan MagangHub' })).toBeInTheDocument()
    expect(localStorage.getItem('maganghub.token')).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(s!.mock.calls.some(([, m]) => m.type === 'token')).toBe(false)
    expect(localStorage.getItem('maganghub.token')).toBeNull()
  })

  it('Keluar survives a reload: no quiet re-fetch until Hubungkan is clicked', async () => {
    const s = setup({ answer: () => ({ ok: true, token: 'again' }) })
    const first = render(<MagangHubCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Keluar' }))
    first.unmount()
    render(<MagangHubCard />) // the page reloaded
    const btn = await screen.findByRole('button', { name: 'Hubungkan MagangHub' })
    await new Promise((r) => setTimeout(r, 50))
    expect(s!.mock.calls.some(([, m]) => m.type === 'token')).toBe(false)
    expect(localStorage.getItem('maganghub.token')).toBeNull()
    fireEvent.click(btn)
    expect(await screen.findByLabelText('Tanggal')).toBeInTheDocument()
    expect(localStorage.getItem('maganghub.token')).toBe('again')
  })

  it('does not flash the install steps while checking for the extension', async () => {
    localStorage.removeItem('maganghub.token')
    setup({ answer: () => ({ error: 'login' }) })
    render(<MagangHubCard />)
    expect(screen.queryByText('Pasang ekstensi dulu')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Hubungkan MagangHub' })).toBeInTheDocument()
  })

  it('Generate fills the three fields', async () => {
    const texts = { activity_log: 'a'.repeat(110), lesson_learned: 'b'.repeat(110), obstacles: 'c'.repeat(110) }
    localStorage.setItem('generate.settings', JSON.stringify({ repo: 'https://github.com/o/r', token: 'T', deepseekKey: 'K' }))
    const gc = await import('@/lib/gitCommits'); const gl = await import('@/lib/generateLog')
    vi.spyOn(gc, 'fetchTodayCommits').mockResolvedValue({ commits: [], trimmed: false })
    vi.spyOn(gl, 'generateLog').mockResolvedValue(texts)
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Aktivitas' })).toHaveValue(texts.activity_log))
    expect(screen.getByRole('textbox', { name: 'Kendala' })).toHaveValue(texts.obstacles)
  })

  it('while Generate runs the fields are greyed and locked, typed text stays, then it is replaced', async () => {
    const texts = { activity_log: 'a'.repeat(110), lesson_learned: 'b'.repeat(110), obstacles: 'c'.repeat(110) }
    localStorage.setItem('generate.settings', JSON.stringify({ repo: 'https://github.com/o/r', token: 'T', deepseekKey: 'K' }))
    const gc = await import('@/lib/gitCommits'); const gl = await import('@/lib/generateLog')
    let release!: (v: any) => void
    vi.spyOn(gc, 'fetchTodayCommits').mockResolvedValue({ commits: [], trimmed: false })
    vi.spyOn(gl, 'generateLog').mockReturnValue(new Promise((r) => { release = r }))
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    const box = screen.getByRole('textbox', { name: 'Aktivitas' })
    fireEvent.change(box, { target: { value: 'ketikan saya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(box).toHaveAttribute('readonly'))
    expect(box).toHaveValue('ketikan saya')
    expect(box.className).toMatch(/bg-muted/)
    release(texts)
    await waitFor(() => expect(box).toHaveValue(texts.activity_log))
    await waitFor(() => expect(box).not.toHaveAttribute('readonly'))
  })

  it('Perbarui token greys out and locks the card until it finishes', async () => {
    let answer!: (v: unknown) => void
    setup({ answer: (m) => (m.type === 'token' ? new Promise((r) => { answer = r }) : { ok: true }) })
    const { container } = render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    await waitFor(() => expect(container.querySelector('[inert]')).not.toBeNull())
    expect(container.querySelector('[inert]')).toContainElement(screen.getByRole('textbox', { name: 'Aktivitas' }))
    answer({ error: 'login' })
    await waitFor(() => expect(container.querySelector('[inert]')).toBeNull())
  })
  it('cannot send while checking whether today is already sent', async () => {
    setup()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // the check never answers
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fill()
    expect(screen.getByRole('button', { name: 'Kirim log' })).toBeDisabled()
    expect(screen.getByText('Memeriksa log hari ini…')).toBeInTheDocument()
  })

  it('a failed check blocks sending (never assumed "not sent"); Cek lagi retries', async () => {
    let fail = true
    setup()
    vi.stubGlobal('fetch', vi.fn(async () => (fail ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ data: [] })))))
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fill()
    expect(await screen.findByText('Belum bisa memastikan log hari ini.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kirim log' })).toBeDisabled()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Cek lagi' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kirim log' })).toBeEnabled())
  })

  it('a log sent elsewhere meanwhile is caught right before sending: nothing is sent', async () => {
    let rows: unknown[] = []
    const s = setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: rows, total: rows.length }))))
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fill()
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim log' }))
    rows = [{ date: TODAY, created_at: `${TODAY}T09:15:00` }]
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim ke MagangHub' }))
    expect(await screen.findByText('Terkirim 09:15')).toBeInTheDocument()
    expect(sends(s)).toEqual([])
    expect(screen.queryByRole('button', { name: 'Kirim ke MagangHub' })).toBeNull()
  })

  it('without a token: a connect step instead of the form, then the form', async () => {
    localStorage.removeItem('maganghub.token')
    let tokenAnswer: any = { error: 'login' }
    const s = setup({ answer: () => tokenAnswer })
    render(<MagangHubCard />)
    const btn = await screen.findByRole('button', { name: 'Hubungkan MagangHub' })
    expect(screen.queryByRole('textbox', { name: 'Aktivitas' })).toBeNull()
    tokenAnswer = { ok: true, token: 'fresh' }
    fireEvent.click(btn)
    expect(await screen.findByRole('textbox', { name: 'Aktivitas' })).toBeInTheDocument()
    expect(s).toHaveBeenCalledWith(expect.any(String), { type: 'token', interactive: true }, expect.any(Function))
  })

  it('with an expired token: the connect step says so', async () => {
    setup({ status: 401, answer: () => ({ error: 'login' }) })
    render(<MagangHubCard />)
    expect(await screen.findByText('Token MagangHub kedaluwarsa')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Aktivitas' })).toBeNull()
  })

  it('without the extension and a token: install steps instead of the form', async () => {
    localStorage.removeItem('maganghub.token')
    setup({ installed: false })
    render(<MagangHubCard />)
    expect(await screen.findByRole('link', { name: /Unduh ekstensi/ })).toHaveAttribute('href', '/shelia-maganghub.zip')
    expect(screen.queryByRole('textbox', { name: 'Aktivitas' })).toBeNull()
  })

  it('refreshes a missing token silently on load', async () => {
    localStorage.removeItem('maganghub.token')
    const s = setup({ answer: () => ({ ok: true, token: 'fresh' }) })
    render(<MagangHubCard />)
    await waitFor(() => expect(localStorage.getItem('maganghub.token')).toBe('fresh'))
    expect(s).toHaveBeenCalledWith(expect.any(String), { type: 'token', interactive: false }, expect.any(Function))
  })
})

describe('MagangHubCard draft (tab closed and reopened)', () => {
  const draft = (date: string) => JSON.stringify({ date, v: { activity_log: 'aku', lesson_learned: 'belajar', obstacles: 'kendala' }, point: { lat: -6.2, lng: 106.8 } })

  it("restores today's three texts and location", async () => {
    localStorage.setItem('maganghub.draft', draft(TODAY))
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    expect(screen.getByRole('textbox', { name: 'Aktivitas' })).toHaveValue('aku')
    expect(screen.getByRole('textbox', { name: 'Pembelajaran' })).toHaveValue('belajar')
    expect(screen.getByRole('textbox', { name: 'Kendala' })).toHaveValue('kendala')
    expect(screen.getByLabelText('Latitude')).toHaveValue('-6.2')
    expect(screen.getByLabelText('Longitude')).toHaveValue('106.8')
  })

  it('ignores a draft from another day', async () => {
    localStorage.setItem('maganghub.draft', draft('2000-01-01'))
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    expect(screen.getByRole('textbox', { name: 'Aktivitas' })).toHaveValue('')
    expect(screen.getByLabelText('Latitude')).toHaveValue('-7.308430344545027')
  })

  it('saves what is typed', async () => {
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fireEvent.change(screen.getByRole('textbox', { name: 'Aktivitas' }), { target: { value: 'ketik' } })
    await waitFor(() => expect(JSON.parse(localStorage.getItem('maganghub.draft')!)).toMatchObject({ date: TODAY, v: { activity_log: 'ketik' } }))
  })
})

describe('MagangHubCard Kosongkan', () => {
  beforeEach(() => toast.dismiss())
  const draft = JSON.stringify({ date: TODAY, v: { activity_log: 'aku', lesson_learned: 'b', obstacles: 'c' }, point: { lat: -6.2, lng: 106.8 } })

  it('is disabled when the form is already empty', async () => {
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    expect(screen.getByRole('button', { name: 'Kosongkan' })).toBeDisabled()
  })

  it('clears the three texts and the location, and Batalkan brings them back', async () => {
    localStorage.setItem('maganghub.draft', draft)
    setup()
    render(<><MagangHubCard /><Toaster /></>)
    await screen.findByLabelText('Tanggal')
    fireEvent.click(screen.getByRole('button', { name: 'Kosongkan' }))
    expect(screen.getByRole('textbox', { name: 'Aktivitas' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Kendala' })).toHaveValue('')
    expect(screen.getByLabelText('Latitude')).toHaveValue('-7.308430344545027')
    await waitFor(() => expect(localStorage.getItem('maganghub.draft')).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: 'Batalkan' }))
    expect(screen.getByRole('textbox', { name: 'Aktivitas' })).toHaveValue('aku')
    expect(screen.getByLabelText('Latitude')).toHaveValue('-6.2')
  })
})

describe('MagangHubCard Keluar', () => {
  it('empties the form and leaves no draft behind', async () => {
    localStorage.setItem('maganghub.draft', JSON.stringify({ date: TODAY, v: { activity_log: 'rahasia', lesson_learned: 'b', obstacles: 'c' }, point: { lat: -6.2, lng: 106.8 } }))
    setup()
    render(<MagangHubCard />)
    await screen.findByLabelText('Tanggal')
    fireEvent.click(screen.getAllByRole('button', { name: 'Keluar' })[0])
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Aktivitas' })).toBeNull())
    await waitFor(() => expect(localStorage.getItem('maganghub.draft')).toBeNull())
    expect(localStorage.getItem('generate.settings')).toBeNull()
  })
})
