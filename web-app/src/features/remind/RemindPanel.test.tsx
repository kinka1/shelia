import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RemindPanel } from './RemindPanel'
import { todayWIB } from '@/lib/dailyLog'

afterEach(() => vi.unstubAllGlobals())
const INVITE = 'https://t.me/+example'
const me = (o = {}) => ({ name: 'Bagas', shelia: true, maganghub: false, admin: false, holiday: false, invite: INVITE, ...o })
function stub(meBody: unknown, status = 200) {
  const f = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'PUT' ? new Response(null, { status: 204 }) : new Response(JSON.stringify(meBody), { status }))
  vi.stubGlobal('fetch', f)
  return f
}
const puts = (f: ReturnType<typeof stub>) => f.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT').map((c) => [c[0], JSON.parse(String((c[1] as RequestInit).body))])

describe('RemindPanel', () => {
  it('renders nothing when the reminder service is off', async () => {
    const f = stub({}, 502)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<RemindPanel />)
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
  it('shows name and platforms, no name editing', async () => {
    stub(me())
    render(<RemindPanel />)
    expect(await screen.findByText('Pengingat Telegram')).toBeInTheDocument()
    expect(screen.getByText('Nama di channel: Bagas')).toBeInTheDocument()
    expect(screen.getByText('Shelia ✅ · MagangHub –')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /libur/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('opens or copies the channel invite link', async () => {
    stub(me())
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<RemindPanel />)
    const open = await screen.findByRole('link', { name: 'Buka channel' })
    expect(open).toHaveAttribute('href', INVITE)
    expect(open).toHaveAttribute('target', '_blank')
    expect(open).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(screen.getByRole('button', { name: 'Salin link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(INVITE))
    expect(await screen.findByRole('button', { name: 'Tersalin' })).toBeInTheDocument()
  })
  it('no invite configured: no channel buttons', async () => {
    stub(me({ invite: null }))
    render(<RemindPanel />)
    await screen.findByText('Pengingat Telegram')
    expect(screen.queryByRole('link', { name: 'Buka channel' })).toBeNull()
  })
  it('admin gets the Libur hari ini switch', async () => {
    const f = stub(me({ admin: true }))
    render(<RemindPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Libur hari ini' }))
    await waitFor(() => expect(puts(f)).toContainEqual(['/remind-api/holiday', { date: todayWIB(), on: true }]))
  })
})
