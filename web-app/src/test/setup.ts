import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom di sini tidak menyediakan Web Storage, sedangkan aplikasi memakainya
 * saat modul dimuat (token apiClient, situs klien terpilih, tema). Tanpa stub
 * ini, mengimpor apa pun yang menyentuh lapisan API akan menggagalkan tes.
 */
const createStorage = (): Storage => {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value)
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (globalThis[name]) continue
  Object.defineProperty(globalThis, name, { value: createStorage(), writable: true, configurable: true })
}

/**
 * jsdom juga tidak punya ResizeObserver, sedangkan primitif Radix (radio,
 * select, tooltip) memanggilnya saat dipasang. Tanpa stub ini komponen itu
 * gagal dirender di tes.
 */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    writable: true,
    configurable: true,
  })
}

/**
 * jsdom juga tidak punya matchMedia, sedangkan komponen menanyakan preferensi
 * pengguna lewat itu (misalnya `prefers-reduced-motion`). Stub ini menjawab
 * "tidak cocok", yaitu keadaan bawaan peramban tanpa preferensi khusus.
 */
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

/**
 * jsdom juga tidak punya PointerEvent, sedangkan pemicu menu Radix (kebab,
 * select, dropdown) membuka dirinya lewat `pointerdown`, bukan `click`.
 * Tanpa ini `event.button` selalu `undefined` di penanganan Radix, dan
 * menunya tidak pernah terbuka saat disimulasikan lewat `fireEvent`.
 */
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
    }
  }
  Object.defineProperty(globalThis, 'PointerEvent', {
    value: PointerEventPolyfill,
    writable: true,
    configurable: true,
  })
}

/**
 * Dua lagi yang ditanyakan Radix Select saat daftarnya dibuka: penangkapan
 * pointer dan penggeseran ke item terpilih. Keduanya memang tidak ada di
 * jsdom, dan tanpa ini daftar pilihannya tidak pernah muncul di tes.
 */
if (typeof HTMLElement.prototype.hasPointerCapture !== 'function') {
  HTMLElement.prototype.hasPointerCapture = () => false
}
if (typeof HTMLElement.prototype.releasePointerCapture !== 'function') {
  HTMLElement.prototype.releasePointerCapture = () => {}
}
if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
  HTMLElement.prototype.scrollIntoView = () => {}
}

/**
 * jsdom juga tidak punya object URL, sedangkan pratinjau lampiran memakainya
 * untuk menampilkan berkas yang diambil lewat API.
 */
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:test'
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {}
}

// Run cleanup after each test case
afterEach(() => {
  cleanup()
})
