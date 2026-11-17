import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Toaster, toast } from 'sonner'

const fetchTodayCommits = vi.fn()
const generateLog = vi.fn()
vi.mock('@/lib/gitCommits', async (real) => ({ ...(await real<object>()), fetchTodayCommits: (...a: any[]) => fetchTodayCommits(...a) }))
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
    expect(screen.getByLabelText(/^Token akses \(GitHub atau GitLab\) repo 1/)).toHaveAttribute('type', 'password')
    expect(screen.getByText('Token akses (GitHub atau GitLab)')).toBeInTheDocument()
    for (const el of [screen.getByLabelText(/^Link repo 1/), screen.getByLabelText(/^Token akses/), screen.getByLabelText(/API key DeepSeek/)]) expect(el).toBeRequired()
    expect(screen.queryByLabelText(/Username Git/)).toBeNull()
    expect(screen.getByLabelText(/API key DeepSeek/)).toHaveAttribute('type', 'password')
    expect(screen.getByText(/Disimpan hanya di browser ini/)).toBeInTheDocument()
    type(/^Link repo 1/, SETTINGS.repo); type(/^Token akses \(GitHub atau GitLab\) repo 1/, 'T'); type(/API key DeepSeek/, 'K')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(TEXTS))
    const saved = { repos: [{ url: SETTINGS.repo, token: 'T' }], deepseekKey: 'K' }
    expect(JSON.parse(localStorage.getItem('generate.settings')!)).toMatchObject(saved)
    expect(fetchTodayCommits).toHaveBeenCalledWith(expect.objectContaining(saved))
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

  it('the gear reopens settings (an old single-repo setting shows as repo 1); Hapus clears them', async () => {
    localStorage.setItem('generate.settings', JSON.stringify(SETTINGS))
    ui()
    fireEvent.click(screen.getByRole('button', { name: 'Pengaturan Generate' }))
    expect(await screen.findByLabelText(/^Link repo 1/)).toHaveValue(SETTINGS.repo)
    expect(screen.getByLabelText(/^Token akses \(GitHub atau GitLab\) repo 1/)).toHaveValue('T')
    fireEvent.click(screen.getByRole('button', { name: 'Hapus semua' }))
    expect(localStorage.getItem('generate.settings')).toBeNull()
  })

  it('every field is required: an empty one is marked and nothing is saved', async () => {
    ui()
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await screen.findByRole('heading', { name: 'Pengaturan Generate' })
    type(/^Link repo 1/, SETTINGS.repo); type(/API key DeepSeek/, 'K')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Lengkapi semua isian yang wajib.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Token akses/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^Link repo 1/)).not.toHaveAttribute('aria-invalid', 'true')
    expect(localStorage.getItem('generate.settings')).toBeNull()
    expect(fetchTodayCommits).not.toHaveBeenCalled()
  })

  it('shows whether Generate is set up', async () => {
    ui()
    expect(screen.getByText('Belum diatur')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pengaturan Generate' }))
    type(/^Link repo 1/, SETTINGS.repo); type(/^Token akses/, 'T'); type(/API key DeepSeek/, 'K')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Diatur · 1 repo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pengaturan Generate' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus semua' }))
    expect(await screen.findByText('Belum diatur')).toBeInTheDocument()
  })
  it('several repos: Tambah repo adds a row, Hapus repo removes one, all are saved', async () => {
    ui()
    fireEvent.click(screen.getByRole('button', { name: 'Pengaturan Generate' }))
    type(/^Link repo 1/, 'https://github.com/o/web'); type(/^Token akses \(GitHub atau GitLab\) repo 1/, 'T1')
    fireEvent.click(screen.getByRole('button', { name: 'Tambah repo' }))
    type(/^Link repo 2/, 'https://gitlab.com/g/api'); type(/^Token akses \(GitHub atau GitLab\) repo 2/, 'T2')
    fireEvent.click(screen.getByRole('button', { name: 'Tambah repo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hapus repo 3' }))
    expect(screen.queryByLabelText(/^Link repo 3/)).toBeNull()
    type(/API key DeepSeek/, 'K')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('generate.settings')!).repos).toEqual([
      { url: 'https://github.com/o/web', token: 'T1' }, { url: 'https://gitlab.com/g/api', token: 'T2' },
    ]))
  })

  it('tells the card while it works, so the fields can’t be edited mid-run', async () => {
    localStorage.setItem('generate.settings', JSON.stringify(SETTINGS))
    let release!: (v: unknown) => void
    generateLog.mockReturnValue(new Promise((r) => { release = r }))
    const onBusy = vi.fn()
    render(<GenerateLog value={EMPTY} onChange={vi.fn()} onBusy={onBusy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(true))
    release(TEXTS)
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false))
  })

  it('shows notes about skipped repos or branches', async () => {
    localStorage.setItem('generate.settings', JSON.stringify(SETTINGS))
    fetchTodayCommits.mockResolvedValue({ commits: [], trimmed: false, note: 'o/secret: Repo tidak ditemukan atau privat. Isi token akses.' })
    ui()
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByText(/o\/secret: Repo tidak ditemukan/)).toBeInTheDocument()
  })
})
