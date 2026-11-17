import { describe, expect, it } from 'vitest'
import { sheliaItem } from './Absen'

const base = { work_date: '2026-11-17', message: 'Silakan check-in' }
const sess = (o: object) => [{ work_date: '2026-11-17', check_in_time: '2026-11-17 08:02:00', ...o }]

describe('sheliaItem (kartu status absen)', () => {
  it('belum masuk → todo dengan aksi check-in', () => {
    const it_ = sheliaItem({ ...base, status: 'not_checked_in', next_action: 'check_in', sessions: [] }, false)!
    expect([it_.tone, it_.value, it_.action]).toEqual(['todo', 'Belum masuk', 'Check-in sekarang'])
  })
  it('sudah masuk, belum pulang → partial dengan aksi check-out', () => {
    const it_ = sheliaItem({ ...base, status: 'checked_in', next_action: 'check_out', sessions: sess({}) }, false)!
    expect([it_.tone, it_.value, it_.action]).toEqual(['partial', 'Sudah masuk 08:02', 'Check-out'])
  })
  it('selesai → done tanpa aksi, jam masuk dan pulang', () => {
    const it_ = sheliaItem({ ...base, status: 'late', next_action: 'none', sessions: sess({ check_out_time: '2026-11-17 17:05:00' }) }, false)!
    expect([it_.tone, it_.value, it_.action]).toEqual(['done', 'Masuk 08:02 · pulang 17:05 (terlambat)', undefined])
  })
  it('masih memuat → null (skeleton)', () => expect(sheliaItem(null, true)).toBeNull())
  it('belum login Shelia → todo dengan aksi login', () => {
    const it_ = sheliaItem(null, false, false)!
    expect([it_.tone, it_.value, it_.action]).toEqual(['todo', 'Belum login', 'Login'])
  })
})
