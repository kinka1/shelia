import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TokenDialog } from './TokenDialog'

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
})
