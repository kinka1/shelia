import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Riwayat from './Riwayat'
import { saveSession } from '@/lib/shelia'
import { SessionProvider } from '@/features/session/SessionProvider'

const json = (b: unknown) => new Response(JSON.stringify(b))
const NOV = [{ attendance_date: '2026-11-03 00:00:00', status: 'checked_out', shift: { name: 'Pagi' }, check_in: { check_in_time: '2026-11-03 08:01:00' }, check_out: { check_out_time: '2026-11-03 17:02:00' } }]
const LOGS = [{ date: '2026-11-03', state: 'PENDING', activity_log: 'Fix bug login', lesson_learned: 'Belajar token', obstacles: 'Tidak ada' }]

type Answer = (url: string) => Response | Promise<Response>
function stub(answer?: Answer) {
  const f = vi.fn(async (url: string) => {
    if (answer) return answer(url)
    if (url.includes('daily-logs')) return json({ data: url.includes('page=1') ? LOGS : [] })
    return json({ data: url.includes('2026-11') ? NOV : [] })
  })
  vi.stubGlobal('fetch', f)
  return f
}
const ui = () => render(<MemoryRouter><SessionProvider><Riwayat /></SessionProvider></MemoryRouter>)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T03:00:00Z'))
  saveSession('tok', { full_name: 'Budi' })
  localStorage.setItem('maganghub.token', 'mh')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear() })

describe('Riwayat', () => {
  it('shows the month calendar with colours, ✓ for logs, legend and counts', async () => {
    stub(); ui()
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
    const cal = await screen.findByRole('list', { name: 'Kalender November 2026' })
    expect(await within(cal).findByRole('button', { name: '3 November: Hadir, log MagangHub terkirim' })).toBeInTheDocument()
    expect(within(cal).getByRole('button', { name: '9 November: Tidak ada catatan' })).toBeInTheDocument()
    for (const l of ['Hadir', 'Terlambat', 'Izin', 'Cuti', 'Dinas', 'Tidak hadir', 'Tidak ada catatan', 'Hari mendatang', '✓ Log MagangHub terkirim'])
      expect(within(screen.getByRole('list', { name: 'Keterangan' })).getByText(l)).toBeInTheDocument()
    expect(screen.getByText('1 dari 12 hari kerja')).toBeInTheDocument()
  })

  it('clicking a day shows its session and log; a day without log says so', async () => {
    stub(); ui()
    fireEvent.click(await screen.findByRole('button', { name: /^3 November/ }))
    const d = screen.getByRole('region', { name: /3 Nov 2026/ })
    expect(within(d).getByText('Pagi')).toBeInTheDocument()
    expect(within(d).getByText(/08:01/)).toBeInTheDocument()
    expect(within(d).getByText(/17:02/)).toBeInTheDocument()
    expect(within(d).getByText('Fix bug login')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^9 November/ }))
    expect(screen.getByText('Belum ada log')).toBeInTheDocument()
  })

  it('‹ goes to October, › is off on the current month, Bulan ini comes back', async () => {
    const f = stub(); ui()
    await screen.findByRole('button', { name: /^3 November/ })
    expect(screen.getByRole('button', { name: 'Bulan berikutnya' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bulan ini' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Bulan sebelumnya' }))
    expect(await screen.findByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument()
    await waitFor(() => expect(f.mock.calls.some(([u]) => u.includes('month=2026-10'))).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Bulan ini' }))
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
  })

  it('a late answer for an older month never replaces the newer month', async () => {
    let releaseOct!: () => void
    stub((url) => {
      if (url.includes('daily-logs')) return json({ data: [] })
      if (url.includes('2026-10')) return new Promise((r) => { releaseOct = () => r(json({ data: [{ attendance_date: '2026-11-03 00:00:00', status: 'absent' }] })) })
      return json({ data: NOV })
    })
    ui()
    await screen.findByRole('button', { name: /^3 November: Hadir/ })
    fireEvent.click(screen.getByRole('button', { name: 'Bulan sebelumnya' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bulan ini' }))
    expect(await screen.findByRole('button', { name: /^3 November: Hadir/ })).toBeInTheDocument()
    releaseOct()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByRole('button', { name: /^3 November: Hadir/ })).toBeInTheDocument()
  })

  it('without Shelia login the logs still show; without MagangHub the colours still show', async () => {
    localStorage.removeItem('absen.token')
    stub(); const { unmount } = ui()
    expect(await screen.findByText('Shelia belum login')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^3 November: .*log MagangHub terkirim/ })).toBeInTheDocument()
    unmount()
    saveSession('tok', {}); localStorage.removeItem('maganghub.token')
    ui()
    expect(await screen.findByText('MagangHub belum terhubung')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '3 November: Hadir' })).toBeInTheDocument()
  })
})
