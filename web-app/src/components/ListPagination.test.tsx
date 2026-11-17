import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ListPagination } from './ListPagination'

describe('ListPagination', () => {
  it('shows the range and page buttons', () => {
    render(<ListPagination page={1} perPage={10} total={34} onPageChange={() => {}} />)
    expect(screen.getByText('1-10 dari 34')).toBeInTheDocument()
    for (const n of ['1', '2', '3', '4']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page')
  })

  it('goes to the next page', () => {
    const onPageChange = vi.fn()
    render(<ListPagination page={1} perPage={10} total={34} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('offers page jump at 30 pages', () => {
    render(<ListPagination page={1} perPage={10} total={300} onPageChange={() => {}} />)
    expect(screen.getByLabelText(/Ke halaman/)).toBeInTheDocument()
  })

  it('without a total shows only arrows, next driven by hasNext', () => {
    render(<ListPagination page={2} perPage={10} total={null} hasNext={false} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Halaman berikutnya' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Halaman sebelumnya' })).toBeEnabled()
    expect(screen.queryByText(/dari/)).toBeNull()
    expect(screen.queryByRole('button', { name: '2' })).toBeNull()
  })

  it('hides the per-page select without onPerPageChange', () => {
    render(<ListPagination page={1} perPage={10} total={34} onPageChange={() => {}} />)
    expect(screen.queryByLabelText('Baris per halaman')).toBeNull()
  })
})
