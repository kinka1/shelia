import { afterEach, describe, expect, it } from 'vitest'
import { initTheme, setTheme } from '@/lib/theme'

const html = document.documentElement

function mockDark(initial: boolean) {
  let cb: () => void = () => {}
  const mql = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => (cb = fn),
  }
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia
  return (v: boolean) => {
    mql.matches = v
    cb()
  }
}

describe('theme', () => {
  afterEach(() => {
    localStorage.clear()
    html.classList.remove('dark')
  })

  it('defaults to light when nothing is stored, even in a dark browser', () => {
    mockDark(true)
    initTheme()
    expect(html).not.toHaveClass('dark')
  })

  it('stored system follows the browser, live', () => {
    const flip = mockDark(true)
    localStorage.setItem('shelia-theme', 'system')
    initTheme()
    expect(html).toHaveClass('dark')
    flip(false)
    expect(html).not.toHaveClass('dark')
  })

  it('stored light ignores a dark browser', () => {
    mockDark(true)
    localStorage.setItem('shelia-theme', 'light')
    initTheme()
    expect(html).not.toHaveClass('dark')
  })

  it('setTheme dark persists and applies', () => {
    mockDark(false)
    initTheme()
    setTheme('dark')
    expect(html).toHaveClass('dark')
    expect(localStorage.getItem('shelia-theme')).toBe('dark')
  })
})
