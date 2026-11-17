import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
