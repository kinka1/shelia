import { describe, expect, it } from 'vitest'
import { fieldState, remainingFields, todayWIB } from './dailyLog'

describe('dailyLog', () => {
  it('counts trimmed characters', () => {
    expect(fieldState('x'.repeat(99) + '  ')).toEqual({ count: 99, ok: false, missing: 1 })
    expect(fieldState('x'.repeat(100)).ok).toBe(true)
  })
  it('remainingFields counts not-ok fields', () => {
    expect(remainingFields({ activity_log: 'x'.repeat(100), lesson_learned: '', obstacles: 'a' })).toBe(2)
  })
  it('todayWIB rolls over at UTC+7', () => {
    expect(todayWIB(new Date('2026-11-17T18:00:00Z'))).toBe('2026-11-18')
  })
})
