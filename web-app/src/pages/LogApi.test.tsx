import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { clearLog, loggedFetch } from '@/lib/apiLog'
import LogApi from './LogApi'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })

beforeEach(async () => {
  act(() => clearLog())
  const answers = [
    json({ data: 1 }),
    json({ message: 'Lokasi di luar area', error_code: 'ERR-HR-001', bypass_token: 'rahasia' }, 422),
    json({ data: [] }),
  ]
  vi.stubGlobal('fetch', vi.fn(async () => answers.shift()!))
  await act(async () => {
    await loggedFetch('/api/v2/attendance/face/verify', { action: 'Absen masuk', method: 'POST' })
    await loggedFetch('/api/v2/attendance/check-in', { action: 'Absen masuk', method: 'POST' })
    await loggedFetch('/maganghub-api/v1/daily-logs?page=1', { action: 'Riwayat' })
  })
})

describe('LogApi', () => {
  it('groups entries by action with a time label and shows the header', () => {
    render(<LogApi />)
    expect(screen.getByText(/^Absen masuk · \d\d:\d\d$/)).toBeInTheDocument()
    expect(screen.getByText('3 panggilan di sesi ini · 1 gagal')).toBeInTheDocument()
  })

  it('shows the summary and redacted response for a selected failure', () => {
    render(<LogApi />)
    fireEvent.click(screen.getByRole('button', { name: /Kirim absen masuk/ }))
    expect(screen.getByText('Gagal (422)', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/Lokasi di luar area/)).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Response' }), { button: 0 })
    fireEvent.click(screen.getByRole('tab', { name: 'Response' }))
    expect(screen.getAllByText('[disembunyikan]').length).toBeGreaterThan(0)
    expect(screen.queryByText(/"rahasia"/)).toBeNull()
  })

  it('labels request and response headers on the Header tab', () => {
    render(<LogApi />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Header' }), { button: 0 })
    fireEvent.click(screen.getByRole('tab', { name: 'Header' }))
    expect(screen.getByText('Header permintaan')).toBeInTheDocument()
    expect(screen.getByText('Header respons')).toBeInTheDocument()
  })

  it('filters by status and source', () => {
    render(<LogApi />)
    fireEvent.click(screen.getByRole('button', { name: 'Gagal (1)' }))
    expect(screen.getAllByTestId('log-row')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Semua status' }))
    fireEvent.click(screen.getByRole('button', { name: 'MagangHub' }))
    const rows = screen.getAllByTestId('log-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText(/maganghub-api/)).toBeInTheDocument()
  })

  it('clears the log', () => {
    render(<LogApi />)
    fireEvent.click(screen.getByRole('button', { name: 'Bersihkan' }))
    expect(screen.getByText('Belum ada panggilan API di sesi ini.')).toBeInTheDocument()
  })
})
