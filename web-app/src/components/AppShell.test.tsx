import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

describe('AppShell', () => {
  it('shows the rail links and marks the current page', () => {
    render(
      <MemoryRouter initialEntries={['/log-api']}>
        <App />
      </MemoryRouter>,
    )
    for (const name of ['Absen', 'Riwayat Shelia', 'Riwayat MagangHub', 'Log API']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Log API' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Log API' })).toBeVisible()
  })
})
