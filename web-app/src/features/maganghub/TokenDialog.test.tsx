import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
