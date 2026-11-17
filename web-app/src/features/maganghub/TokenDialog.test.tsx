import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TokenDialog } from './TokenDialog'
import { stubExt } from '@/test/ext'

describe('TokenDialog', () => {
  it('sets the bookmarklet href imperatively (React 19 blocks javascript: props)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<TokenDialog connected={false} onDisconnect={() => {}} />)
    screen.getByRole('button', { name: 'Perbarui token' }).click()
    const a = await screen.findByText('→ Shelia')
    const href = a.getAttribute('href') ?? ''
    expect(href.startsWith('javascript:(function')).toBe(true)
    expect(href).not.toContain('React has blocked')
    expect(err.mock.calls.flat().join(' ')).not.toContain('React has blocked')
    err.mockRestore()
  })
  it('links "MagangHub" in the steps to the MagangHub site in a new tab', () => {
    render(<TokenDialog connected={false} onDisconnect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    const a = screen.getByRole('link', { name: 'MagangHub' })
    expect(a).toHaveAttribute('href', 'https://monev.maganghub.kemnaker.go.id/')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })
  it('opens MagangHub from script so the bookmark can close that tab later', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<TokenDialog connected={false} onDisconnect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    fireEvent.click(screen.getByRole('link', { name: 'MagangHub' }))
    expect(open).toHaveBeenCalledWith('https://monev.maganghub.kemnaker.go.id/', '_blank', 'noopener')
    open.mockRestore()
  })
  it('closes itself when a new token arrives', async () => {
    const { rerender } = render(<TokenDialog token="old" connected onDisconnect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    rerender(<TokenDialog token="new" connected onDisconnect={() => {}} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('without the extension: shows install steps with the download and copy buttons', async () => {
    render(<TokenDialog connected={false} onDisconnect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    expect(await screen.findByText('Ekstensi belum terpasang')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Unduh ekstensi/ })).toHaveAttribute('href', '/shelia-maganghub.zip')
    expect(screen.getByRole('button', { name: 'Salin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cek lagi' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '→ Shelia' })).toBeInTheDocument()
  })

  it('with the extension: one Ambil token button, no bookmark', async () => {
    const send = stubExt((m) => (m.type === 'hello' ? { ok: true, version: '1.0.0' } : { ok: true, token: 'tok-new' }))
    const onRefresh = vi.fn()
    render(<TokenDialog connected={false} onDisconnect={() => {}} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    expect(await screen.findByText('Ekstensi terpasang (v1.0.0)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '→ Shelia' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ambil token' }))
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(localStorage.getItem('maganghub.token')).toBe('tok-new')
    expect(send).toHaveBeenCalledWith(expect.any(String), { type: 'token', interactive: true }, expect.any(Function))
    vi.unstubAllGlobals(); localStorage.clear()
  })

  it('with the extension: asks to log in on MagangHub when needed', async () => {
    stubExt((m) => (m.type === 'hello' ? { ok: true, version: '1.0.0' } : { error: 'timeout' }))
    render(<TokenDialog connected={false} onDisconnect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ambil token' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Login MagangHub')
    vi.unstubAllGlobals()
  })
})
