import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import UbahAbsen from './UbahAbsen'
import { saveSession } from '@/lib/shelia'
import { SessionProvider } from '@/features/session/SessionProvider'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
const ROWS = [
  { id: 'u1', attendance_date: '2026-11-18 00:00:00', status: 'late', employee: { full_name: 'Budi' },
    check_in_record: { check_in_time: '2026-11-18T01:40:00.000000Z' }, check_out_record: null },
  { id: 'u2', attendance_date: '2026-11-18 00:00:00', status: 'absent', employee: { full_name: 'Sari' },
    check_in_record: null, check_out_record: null },
]

function stub(patch: () => Response = () => json({ status: 'success', data: {} }), roles: string[] = []) {
  const f = vi.fn(async (url: string, init?: RequestInit) =>
    String(url).startsWith('/api/me/access') ? json({ data: { roles } })
      : init?.method === 'PATCH' ? patch() : json({ data: { data: ROWS } }))
  vi.stubGlobal('fetch', f)
  return f
}
const lists = (f: ReturnType<typeof stub>) => f.mock.calls.filter(([u]) => String(u).endsWith('/admin/attendances'))
const ui = () => render(
  <MemoryRouter initialEntries={['/ubah-absen']}>
    <SessionProvider>
      <Routes>
        <Route path="/" element={<p>HOME</p>} />
        <Route path="/ubah-absen" element={<UbahAbsen />} />
      </Routes>
    </SessionProvider>
  </MemoryRouter>,
)
const open = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `Ubah absen ${name}` }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-18T03:00:00Z'))
  saveSession('tok', { full_name: 'Andi', role_name: 'Superadmin' })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear() })

describe('UbahAbsen', () => {
  it("lists today's attendance", async () => {
    const f = stub()
    ui()
    const row = (await screen.findByText('Budi')).closest('tr')!
    expect(within(row).getByText('08:40')).toBeInTheDocument()
    expect(within(row).getByText('late')).toBeInTheDocument()
    expect(JSON.parse(lists(f)[0][1]!.body as string).start_date).toBe('2026-11-18')
  })

  it('a row without check-in shows a dash and prefills 08:00', async () => {
    stub()
    ui()
    const row = (await screen.findByText('Sari')).closest('tr')!
    expect(within(row).getAllByText('–').length).toBeGreaterThan(0)
    const d = await open('Sari')
    expect(within(d).getByLabelText('Jam masuk')).toHaveValue('2026-11-18T08:00')
    expect(within(d).getByLabelText('Status')).toHaveValue('checked_in')
  })

  it('saving sends the edit and reloads', async () => {
    const f = stub()
    ui()
    const d = await open('Budi')
    expect(within(d).getByLabelText('Jam masuk')).toHaveValue('2026-11-18T08:40')
    fireEvent.change(within(d).getByLabelText('Jam masuk'), { target: { value: '2026-11-18T07:55' } })
    fireEvent.change(within(d).getByLabelText('Status'), { target: { value: 'checked_in' } })
    fireEvent.click(within(d).getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const patch = f.mock.calls.find(([, i]) => i?.method === 'PATCH')!
    expect(String(patch[0])).toMatch(/\/v2\/attendance\/admin\/u1\/check-in$/)
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ check_in_time: '2026-11-18 07:55', status: 'checked_in' })
    await waitFor(() => expect(lists(f).length).toBe(2))
  })

  it('a refused save keeps the dialog open', async () => {
    stub(() => json({ status: 'error', message: 'Tidak boleh', error_code: 'ERR-HR-043' }, 403))
    ui()
    const d = await open('Budi')
    fireEvent.click(within(d).getByRole('button', { name: 'Simpan' }))
    expect(await within(d).findByRole('alert')).toHaveTextContent('ERR-HR-043')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('a non-Superadmin is sent home', async () => {
    saveSession('tok', { full_name: 'Budi', role_name: 'Administrator' })
    const f = stub(undefined, ['Supervisor'])
    ui()
    expect(await screen.findByText('HOME')).toBeInTheDocument()
    expect(lists(f)).toHaveLength(0)
  })

  it('Superadmin from /me/access roles opens the page', async () => {
    saveSession('tok', { full_name: 'Andi', role_name: 'Administrator' })
    stub(undefined, ['Patrol Supervisor', 'Superadmin'])
    ui()
    expect(await screen.findByText('Budi')).toBeInTheDocument()
  })
})
