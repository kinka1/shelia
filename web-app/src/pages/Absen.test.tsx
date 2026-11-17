import { describe, expect, it } from 'vitest'
import { mhItem, remindStatus, sheliaItem } from './Absen'

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
  it('MagangHub belum terhubung → todo dengan aksi hubungkan', () => {
    expect(mhItem(null, false)).toMatchObject({ tone: 'todo', value: 'Belum terhubung', action: 'Hubungkan' })
    expect(mhItem(null, true)).toMatchObject({ tone: 'todo', value: 'Belum diisi', action: 'Isi log' })
    expect(mhItem('08:01', true)).toMatchObject({ tone: 'done', value: 'Terkirim 08:01' })
  })
  it('belum login Shelia → todo dengan aksi login', () => {
    const it_ = sheliaItem(null, false, false)!
    expect([it_.tone, it_.value, it_.action]).toEqual(['todo', 'Belum login', 'Login'])
  })
})

describe('remindStatus (what the reminder extension is told)', () => {
  const d = '2026-11-17'
  it('checked in, not out, no log', () =>
    expect(remindStatus({ status: 'checked_in', next_action: 'check_out' }, null, d)).toEqual({ date: d, masuk: true, pulang: false, log: false }))
  it('all done', () =>
    expect(remindStatus({ status: 'checked_in', next_action: 'done' }, '16:50', d)).toEqual({ date: d, masuk: true, pulang: true, log: true }))
  it('not checked in yet', () =>
    expect(remindStatus({ status: 'absent', next_action: 'check_in' }, null, d)).toEqual({ date: d, masuk: false, pulang: false, log: false }))
})
