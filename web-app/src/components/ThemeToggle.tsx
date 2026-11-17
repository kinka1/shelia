import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme, type Theme } from '@/lib/theme'

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<Theme, string> = { system: 'Sistem', light: 'Terang', dark: 'Gelap' }
const ICON = { system: Monitor, light: Sun, dark: Moon }

/** Satu tombol yang berputar: Sistem, Terang, Gelap. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const Icon = ICON[theme]
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={`Tema: ${LABEL[theme]}. Ketuk untuk ganti ke ${LABEL[NEXT[theme]]}`}
      title={`Tema: ${LABEL[theme]}`}
    >
      <Icon />
    </Button>
  )
}
