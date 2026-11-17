import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { SessionProvider } from '@/features/session/SessionProvider'
import { saveSession } from '@/lib/shelia'

describe('AppShell', () => {
  it('shows the rail links and marks the current page', () => {
    saveSession('t', { full_name: 'Budi', nik: '123', branch_name: 'Surabaya' })
    render(
      <MemoryRouter initialEntries={['/log-api']}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </MemoryRouter>,
    )
    for (const name of ['Absen', 'Riwayat Shelia', 'Riwayat MagangHub', 'Log API']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Log API' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Log API' })).toBeVisible()
  })
})
