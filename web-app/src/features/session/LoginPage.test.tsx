import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import LoginPage from './LoginPage'
import { SessionProvider } from './SessionProvider'
import { getEmployee, getToken, saveSession, sheliaApi } from '@/lib/shelia'

const ui = () => render(<SessionProvider><LoginPage /></SessionProvider>)
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('LoginPage', () => {
  it('requires both fields', () => {
    ui()
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(screen.getByRole('alert')).toHaveTextContent('NIK dan password wajib diisi.')
  })

  it('saves the session on success', async () => {
    const body = { data: { token: 'T', employee: { full_name: 'Budi', nik: '1', branch_name: 'SBY', extra: 'x' } } }
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)))
    vi.stubGlobal('fetch', f)
    ui()
    type('NIK', '1')
    type('Password', 'pw')
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    await waitFor(() => expect(getToken()).toBe('T'))
    expect(getEmployee()).toEqual({ full_name: 'Budi', nik: '1', branch_name: 'SBY' })
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ username: '1', password: 'pw' })
  })

  it('shows the server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Salah' }), { status: 400 })))
    ui()
    type('NIK', '1')
    type('Password', 'pw')
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Salah')
  })

  it('shows the expiry message after a 401', async () => {
    saveSession('old', {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    ui()
    await act(async () => { await sheliaApi('/x', { action: 'T' }).catch(() => {}) })
    expect(screen.getByRole('alert')).toHaveTextContent('Sesi berakhir. Silakan login lagi.')
  })
})
