import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const reload = vi.fn()
vi.mock('@/features/shelia/useToday', () => ({ useToday: () => ({ today: null, loading: false, reload }) }))

import RiwayatShelia from './RiwayatShelia'

const seed = (n: number) =>
  localStorage.setItem(
    'shelia.history',
    JSON.stringify(
      Array.from({ length: n }, (_, i) => ({
        date: `2026-11-${String(16 - i).padStart(2, '0')}`, shift: 'Pagi', checkIn: '08:00', checkOut: '17:00', status: 'hadir',
      })),
    ),
  )

describe('RiwayatShelia', () => {
  beforeEach(() => { localStorage.clear(); reload.mockClear() })

  it('paginates 12 rows at 10 per page', () => {
    seed(12)
    render(<RiwayatShelia />)
    expect(screen.getAllByRole('row')).toHaveLength(11) // header + 10
    expect(screen.getByText('1-10 dari 12')).toBeInTheDocument()
    expect(screen.queryByText(/^Hari sebelumnya/)).toBeNull()
  })

  it('filters by date text', () => {
    seed(12)
    render(<RiwayatShelia />)
    fireEvent.change(screen.getByPlaceholderText('Cari tanggal atau shift…'), { target: { value: '16 Nov' } })
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })

  it('shows empty state and reloads with its own action', () => {
    render(<RiwayatShelia />)
    expect(screen.getByText('Belum ada riwayat.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang' }))
    expect(reload).toHaveBeenCalledWith('Muat riwayat Shelia')
  })
})
