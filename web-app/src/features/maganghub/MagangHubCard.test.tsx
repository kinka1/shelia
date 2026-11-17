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
    for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByLabelText(n), { target: { value: L } })
    expect(send).toBeEnabled()
  })

  it('shows sent state when today already has a log', async () => {
    stub([{ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()), clock_in: '08:01' }])
    render(<MagangHubCard />)
    expect(await screen.findByText('Terkirim 08:01')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Aktivitas')).toBeDisabled())
  })

  it('maps 422 errors to fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i?: RequestInit) =>
      i?.method === 'POST' ? json({ message: 'x', errors: { obstacles: 'obstacles minimal 100 karakter' } }, 422) : json({ data: [] })))
    render(<MagangHubCard />)
    for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByLabelText(n), { target: { value: L } })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    expect(await screen.findByText('Minimal 100 karakter')).toBeInTheDocument()
  })

  it('shows a message when 409 finds no row on re-check', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i?: RequestInit) =>
      i?.method === 'POST' ? json({ message: 'Absensi untuk tanggal ini sudah ada' }, 409) : json({ data: [] })))
    render(<MagangHubCard />)
    for (const n of ['Aktivitas', 'Pembelajaran', 'Kendala']) fireEvent.change(screen.getByLabelText(n), { target: { value: L } })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim log' }))
    expect(await screen.findByText('Log untuk tanggal ini sudah ada.')).toBeInTheDocument()
  })
})
