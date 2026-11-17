/**
 * Mode terang/gelap. Kelas `dark` di <html> menggerakkan token Tailwind;
 * pilihan disimpan di localStorage supaya bertahan antar sesi.
 */
import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'shelia-theme'

type Theme = 'light' | 'dark'

const readStored = (): Theme => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const listeners = new Set<() => void>()
let current: Theme = 'light'

const apply = (theme: Theme) => {
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Penyimpanan bisa gagal di mode privat; tema tetap berlaku untuk sesi ini.
  }
  listeners.forEach((listener) => listener())
}

/** Panggil sekali saat aplikasi dimuat. */
export const initTheme = () => {
  current = readStored()
  document.documentElement.classList.toggle('dark', current === 'dark')
}

export const useTheme = () => {
  const theme = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
  const toggle = useCallback(() => apply(current === 'dark' ? 'light' : 'dark'), [])
  return { theme, toggle }
}
