import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const fetchDailyLogs = vi.fn()
vi.mock('@/lib/maganghub', () => ({ fetchDailyLogs: (...a: unknown[]) => fetchDailyLogs(...a) }))

import RiwayatMagangHub from './RiwayatMagangHub'

const rows = [1, 2, 3].map((i) => ({
  date: `2026-11-${10 + i}`, clock_in: '08:0' + i, status: 'PRESENT',
  activity_log: `Aktivitas lengkap ${i} `.repeat(10), lesson_learned: `Belajar ${i} `.repeat(10), obstacles: `Kendala ${i} `.repeat(10),
}))
const renderPage = () => render(<MemoryRouter><RiwayatMagangHub /></MemoryRouter>)

describe('RiwayatMagangHub', () => {
  beforeEach(() => fetchDailyLogs.mockReset())

  it('renders the table with no dialog on load and no page-size control', async () => {
    fetchDailyLogs.mockResolvedValue({ status: 'ok', rows, total: 3 })
    renderPage()
    await screen.findByText('11 Nov 2026')
    expect(screen.getAllByRole('row')).toHaveLength(4)
    for (const h of ['Tanggal', 'Dikirim', 'Status', 'Aktivitas', 'Pembelajaran', 'Kendala']) expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Baris per halaman')).toBeNull()
  })

  it('opens detail, navigates, and returns focus on Escape', async () => {
    fetchDailyLogs.mockResolvedValue({ status: 'ok', rows, total: 3 })
    renderPage()
    await screen.findByText('11 Nov 2026')
    const row1 = screen.getAllByRole('row')[1]
    fireEvent.click(row1)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(rows[0].activity_log.trim())
    expect(dialog).toHaveTextContent(rows[0].lesson_learned.trim())
    expect(dialog).toHaveTextContent(rows[0].obstacles.trim())
    fireEvent.click(within(dialog).getByRole('button', { name: /Berikutnya/ }))
    expect(within(screen.getByRole('dialog')).getByText(/12 Nov 2026/)).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sebelumnya/ }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(row1).toHaveFocus())
  })

  it('filters the loaded rows by activity text', async () => {
    fetchDailyLogs.mockResolvedValue({ status: 'ok', rows, total: 3 })
    renderPage()
    await screen.findByText('11 Nov 2026')
    fireEvent.change(screen.getByPlaceholderText('Cari aktivitas…'), { target: { value: 'belajar 2' } })
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText('12 Nov 2026')).toBeInTheDocument()
  })

  it('shows not-connected state with a link', async () => {
    fetchDailyLogs.mockResolvedValue({ status: 'none', rows: [], total: null })
    renderPage()
    expect(await screen.findByText('MagangHub belum terhubung')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hubungkan di halaman Absen' })).toHaveAttribute('href', '/')
    // Pesan ada di dalam tabel, di bawah kepala kolom.
    expect(screen.getByRole('columnheader', { name: 'Aktivitas' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /MagangHub belum terhubung/ })).toBeInTheDocument()
  })

  it('shows expired state and error text', async () => {
    fetchDailyLogs.mockResolvedValue({ status: 'expired', rows: [], total: null })
    const { unmount } = renderPage()
    expect(await screen.findByText('Token MagangHub kedaluwarsa')).toBeInTheDocument()
    unmount()
    fetchDailyLogs.mockResolvedValue({ status: 'ok', rows: [], total: null, error: 'Gagal memuat (HTTP 500)' })
    renderPage()
    expect(await screen.findByText('Gagal memuat (HTTP 500)')).toBeInTheDocument()
  })

  it('reloads with its own action name', async () => {
    fetchDailyLogs.mockResolvedValue({ status: 'ok', rows, total: 3 })
    renderPage()
    await screen.findByText('11 Nov 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang' }))
    await waitFor(() => expect(fetchDailyLogs).toHaveBeenLastCalledWith(1, 'Muat riwayat MagangHub'))
  })

  it('tolerates rows without a date', async () => {
    fetchDailyLogs.mockResolvedValue({ status: 'ok', rows: [{}, { date: '2026-11-17', activity_log: 'a' }], total: 2 })
    renderPage()
    expect(await screen.findByText('17 Nov 2026')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('row')[1])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('ignores a slower earlier response', async () => {
    let slow!: (v: unknown) => void
    fetchDailyLogs.mockReturnValueOnce(new Promise((r) => { slow = r }))
    fetchDailyLogs.mockResolvedValue({ status: 'ok', rows, total: 3 })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang' }))
    await screen.findByText('11 Nov 2026')
    slow({ status: 'ok', rows: [{ date: '2020-01-01' }], total: 1 })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('1 Jan 2020')).toBeNull()
  })

  it('without a total, next is disabled on a short last page', async () => {
    const full = [1, 2, 3].map((i) => ({ date: `2026-11-${10 + i}` }))
    fetchDailyLogs.mockResolvedValueOnce({ status: 'ok', rows: full, total: null })
    fetchDailyLogs.mockResolvedValueOnce({ status: 'ok', rows: full.slice(0, 1), total: null })
    renderPage()
    await screen.findByText('11 Nov 2026')
    const next = screen.getByRole('button', { name: 'Halaman berikutnya' })
    expect(next).toBeEnabled()
    fireEvent.click(next)
    await waitFor(() => expect(fetchDailyLogs).toHaveBeenLastCalledWith(2, undefined))
    await screen.findByText('11 Nov 2026')
    expect(screen.getByRole('button', { name: 'Halaman berikutnya' })).toBeDisabled()
  })
})
