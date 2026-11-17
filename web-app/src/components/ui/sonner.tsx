import { Toaster as Sonner } from 'sonner'

import { useTheme } from '@/lib/theme'

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Outlet toast aplikasi. Dipasang sekali di App.tsx dan mengikuti store tema
 * di lib/theme, sumber kebenaran yang sama dengan tombol di menu pengguna.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
