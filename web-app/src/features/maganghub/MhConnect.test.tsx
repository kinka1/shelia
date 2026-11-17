import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MhConnect } from './MhConnect'
import { stubExt } from '@/test/ext'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('MhConnect', () => {
  it('with the extension: Perbarui token refreshes in one click, no dialog', async () => {
    const send = stubExt((m) => (m.type === 'token' ? { ok: true, token: 'tok-new' } : {}))
    const onRefresh = vi.fn()
    render(<MhConnect installed onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(localStorage.getItem('maganghub.token')).toBe('tok-new')
    expect(send).toHaveBeenCalledWith(expect.any(String), { type: 'token', interactive: true }, expect.any(Function))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows busy state and the login hint', async () => {
    let finish: (r: any) => void = () => {}
    stubExt(() => new Promise((r) => { finish = r }))
    render(<MhConnect installed onRefresh={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perbarui token' }))
    expect(await screen.findByRole('button', { name: 'Memperbarui…' })).toBeDisabled()
    finish({ error: 'timeout' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Login MagangHub')
  })

  it('without the extension: opens install steps only, no bookmarks', async () => {
    render(<MhConnect installed={false} onRefresh={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pasang ekstensi' }))
    const dlg = await screen.findByRole('dialog')
    expect(screen.getByRole('link', { name: /Unduh ekstensi/ })).toHaveAttribute('href', '/phoenix-maganghub.zip')
    expect(screen.getByRole('button', { name: 'Salin' })).toBeInTheDocument()
    expect(dlg).not.toHaveTextContent('bookmark')
    expect(screen.queryByRole('link', { name: '→ Shelia' })).toBeNull()
  })
})
