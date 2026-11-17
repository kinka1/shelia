/**
 * Mode tema: 'system' (ikut peramban), 'light' atau 'dark'. Pilihan disimpan di
 * localStorage; kelas `dark` di <html> menggerakkan token Tailwind. Tanpa
 * pilihan tersimpan, tema terang.
 */
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'shelia-theme'
const QUERY = '(prefers-color-scheme: dark)'

export type Theme = 'system' | 'light' | 'dark'

const readStored = (): Theme => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'system' || v === 'dark' ? v : 'light'
  } catch {
    return 'light'
  }
}

const listeners = new Set<() => void>()
let current: Theme = 'light'

const render = () => {
  const dark = current === 'dark' || (current === 'system' && window.matchMedia(QUERY).matches)
  document.documentElement.classList.toggle('dark', dark)
}

export const setTheme = (theme: Theme) => {
  current = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Penyimpanan bisa gagal di mode privat; tema tetap berlaku untuk sesi ini.
  }
  render()
  listeners.forEach((listener) => listener())
}

/** Panggil sekali saat aplikasi dimuat. */
export const initTheme = () => {
  current = readStored()
  render()
  window.matchMedia(QUERY).addEventListener('change', render)
}

export const useTheme = () => ({
  theme: useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  ),
  setTheme,
})
