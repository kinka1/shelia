import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Toaster, toast } from 'sonner'

const fetchTodayCommits = vi.fn()
const generateLog = vi.fn()
vi.mock('@/lib/gitCommits', () => ({ fetchTodayCommits: (...a: any[]) => fetchTodayCommits(...a) }))
vi.mock('@/lib/generateLog', () => ({ generateLog: (...a: any[]) => generateLog(...a) }))

import { GenerateLog } from './GenerateLog'

const SETTINGS = { repo: 'https://github.com/o/r', token: 'T', deepseekKey: 'K' }
const TEXTS = { activity_log: 'a'.repeat(110), lesson_learned: 'b'.repeat(110), obstacles: 'c'.repeat(110) }
const EMPTY = { activity_log: 'lama', lesson_learned: '', obstacles: '' }
function ui(value = EMPTY) {
  const onChange = vi.fn()
  render(<><GenerateLog value={value} onChange={onChange} /><Toaster /></>)
  return onChange
}
const type = (label: RegExp, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })

beforeEach(() => {
  toast.dismiss()
  localStorage.clear()
  fetchTodayCommits.mockReset().mockResolvedValue({ commits: [{ sha: 'a', message: 'm', files: [] }], trimmed: false })
  generateLog.mockReset().mockResolvedValue(TEXTS)
})
afterEach(() => vi.unstubAllGlobals())

describe('GenerateLog', () => {
  it('first click without settings opens the settings; Simpan saves them and generates', async () => {
    const onChange = ui()
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByRole('heading', { name: 'Pengaturan Generate' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Token akses/)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(/API key DeepSeek/)).toHaveAttribute('type', 'password')
    expect(screen.getByText(/Disimpan hanya di browser ini/)).toBeInTheDocument()
    type(/Link repo/, SETTINGS.repo); type(/Token akses/, 'T'); type(/API key DeepSeek/, 'K')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(TEXTS))
    expect(JSON.parse(localStorage.getItem('generate.settings')!)).toMatchObject(SETTINGS)
    expect(fetchTodayCommits).toHaveBeenCalledWith(expect.objectContaining(SETTINGS))
    expect(generateLog).toHaveBeenCalledWith(expect.any(Array), 'K')
  })

  it('busy and single-run on double click; Batalkan restores the previous text', async () => {
    localStorage.setItem('generate.settings', JSON.stringify(SETTINGS))
    let release!: (v: unknown) => void
    generateLog.mockReturnValue(new Promise((r) => { release = r }))
    const onChange = ui()
    const btn = screen.getByRole('button', { name: 'Generate' })
    fireEvent.click(btn); fireEvent.click(btn)
    expect(await screen.findByRole('button', { name: 'Membuat…' })).toBeDisabled()
    release(TEXTS)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(TEXTS))
    expect(fetchTodayCommits).toHaveBeenCalledTimes(1)
    fireEvent.click(await screen.findByRole('button', { name: 'Batalkan' }))
    expect(onChange).toHaveBeenLastCalledWith(EMPTY)
  })

  it('errors show inline and leave the fields alone', async () => {
    localStorage.setItem('generate.settings', JSON.stringify(SETTINGS))
    fetchTodayCommits.mockResolvedValue({ error: 'Tidak ada commit hari ini' })
    const onChange = ui()
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tidak ada commit hari ini')
    generateLog.mockResolvedValue({ error: 'Saldo DeepSeek habis.' })
    fetchTodayCommits.mockResolvedValue({ commits: [], trimmed: false })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Saldo DeepSeek habis.'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says when commits were trimmed', async () => {
    localStorage.setItem('generate.settings', JSON.stringify(SETTINGS))
    fetchTodayCommits.mockResolvedValue({ commits: [], trimmed: true })
    ui()
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByText('Hanya 30 commit pertama dipakai')).toBeInTheDocument()
  })

  it('the gear reopens settings; Hapus clears them', async () => {
    localStorage.setItem('generate.settings', JSON.stringify(SETTINGS))
    ui()
    fireEvent.click(screen.getByRole('button', { name: 'Pengaturan Generate' }))
    expect(await screen.findByLabelText(/Link repo/)).toHaveValue(SETTINGS.repo)
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
    expect(localStorage.getItem('generate.settings')).toBeNull()
  })

  it('needs a repo and a DeepSeek key; a username only without a token', async () => {
    ui()
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await screen.findByRole('heading', { name: 'Pengaturan Generate' })
    type(/Link repo/, SETTINGS.repo)
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Isi link repo dan API key DeepSeek.')).toBeInTheDocument()
    type(/API key DeepSeek/, 'K')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Tanpa token, isi username Git Anda.')).toBeInTheDocument()
    expect(fetchTodayCommits).not.toHaveBeenCalled()
  })
})
