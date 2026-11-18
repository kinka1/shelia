import { describe, expect, it } from 'vitest'
import { buildAttendForm, currentStep, tokenUsable } from './attendance'

describe('tokenUsable', () => {
  it('needs more than 15s left', () => {
    expect(tokenUsable({ token: 't', expiresAt: 15_001 }, 0)).toBe(true)
    expect(tokenUsable({ token: 't', expiresAt: 15_000 }, 0)).toBe(false)
    expect(tokenUsable(null, 0)).toBe(false)
  })
})

describe('currentStep', () => {
  const base = { needShift: true, shiftId: '', faceOn: true, hasPhoto: false, faceToken: null, now: 0 }
  it('walks the steps', () => {
    expect(currentStep(base)).toBe(1)
    expect(currentStep({ ...base, shiftId: 's' })).toBe(2)
    expect(currentStep({ ...base, shiftId: 's', hasPhoto: true })).toBe(3)
    expect(currentStep({ ...base, shiftId: 's', faceToken: { token: 't', expiresAt: 60_000 } })).toBe(3)
    expect(currentStep({ ...base, needShift: false, faceOn: false })).toBe(3)
  })
})

describe('buildAttendForm', () => {
  it('check-in with face token', () => {
    const f = buildAttendForm({ isIn: true, shiftId: 's1', faceToken: 'ft' })
    // 1-5 m from the office, never the exact same point
    const m = Math.hypot((Number(f.get('lat')) + 7.308430344545027) * 111320, (Number(f.get('lng')) - 112.785199930883) * 111320 * Math.cos(-7.3084 * Math.PI / 180))
    expect(m).toBeGreaterThanOrEqual(1); expect(m).toBeLessThanOrEqual(5)
    expect(f.get('platform')).toBe('web')
    expect(f.get('shift_id')).toBe('s1')
    expect(f.get('face_token')).toBe('ft')
    expect(f.has('file_photo')).toBe(false)
    expect(f.has('reason')).toBe(false)
  })
  it('bypass sends photo', () => {
    const f = buildAttendForm({ isIn: true, bypassToken: 'bt', faceToken: 'ft', photo: new Blob(['x']), photoName: 'a.jpg' })
    expect(f.get('face_bypass_token')).toBe('bt')
    expect(f.has('file_photo')).toBe(true)
    expect(f.has('face_token')).toBe(false)
  })
  it('check-in never sends attendance_id', () => {
    expect(buildAttendForm({ isIn: true, attendanceId: 'a9' }).has('attendance_id')).toBe(false)
  })
  it('check-out has attendance_id and reason when given', () => {
    const f = buildAttendForm({ isIn: false, attendanceId: 'a9', reason: 'lupa absen' })
    expect(f.get('attendance_id')).toBe('a9')
    expect(f.get('reason')).toBe('lupa absen')
  })
})
