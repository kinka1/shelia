import { beforeEach, describe, expect, it } from 'vitest'
import { readHistory, recordToday } from './sheliaHistory'

beforeEach(() => localStorage.clear())
const sess = (o: object = {}) => ({ work_date: '2026-11-17', sessions: [{ shift: { name: 'Pagi' }, check_in_time: '2026-11-17 07:50:00', check_out_time: null, state: 'open', ...o }] })

describe('history', () => {
  it('upserts by date', () => {
    recordToday(sess()); recordToday(sess())
    const h = readHistory()
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ shift: 'Pagi', checkIn: '07:50', checkOut: '-', status: 'berjalan' })
  })
  it('maps late and closed', () => {
    recordToday(sess({ status: 'late' }))
    expect(readHistory()[0].status).toBe('terlambat')
    recordToday({ ...sess({ state: 'closed' }), work_date: '2026-11-18' })
    expect(readHistory()[0]).toMatchObject({ date: '2026-11-18', status: 'hadir' })
  })
  it('no session is belum', () => {
    recordToday({ work_date: '2026-11-19', sessions: [] })
    expect(readHistory()[0]).toMatchObject({ shift: '-', status: 'belum' })
  })
  it('survives corrupt storage', () => {
    localStorage.setItem('shelia.history', '{nope')
    expect(readHistory()).toEqual([])
  })
})
