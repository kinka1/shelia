import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import ThemeToggle from '@/components/ThemeToggle'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession } from '@/features/session/SessionProvider'
import { TelegramFooter } from '@/features/remind/TelegramFooter'
import { useRemindMe } from '@/features/remind/useRemindMe'
import { todayWIB } from '@/lib/dailyLog'
import { remindHoliday } from '@/lib/remindApi'
import { isSuperadmin } from '@/lib/shelia'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { title: 'Absensi', items: [{ to: '/', label: 'Absen', crumb: 'Absen' }] },
  {
    title: 'Riwayat',
    items: [
      { to: '/riwayat', label: 'Riwayat', crumb: 'Riwayat' },
    ],
  },
  {
    title: 'Alat',
    items: [
      { to: '/log-api', label: 'Log API', crumb: 'Log API' },
      { to: '/ubah-absen', label: 'Ubah Absen', crumb: 'Ubah Absen', admin: true },
    ],
  },
]

const today = () =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date())

// "Ayu Pratiwi Sari" -> "AP"
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

function Rail({ onNavigate, invite, admin }: { onNavigate?: () => void; invite?: string | null; admin: boolean }) {
  return (
    <nav aria-label="Menu utama" className="flex h-full flex-col bg-sidebar px-3 py-4 text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-2 pb-4 pt-1 text-[15px] font-bold text-white">
        <img src="/phoenix.svg" alt="" className="size-10" />
        Phoenix
      </div>
      {SECTIONS.map((s) => (
        <div key={s.title}>
          <div className="px-2.5 pb-1.5 pt-3.5 text-[11px] uppercase tracking-[0.08em]">{s.title}</div>
          {s.items.filter((i) => admin || !('admin' in i)).map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex h-10 items-center gap-2.5 rounded-[8px] px-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-white',
                  isActive && 'bg-sidebar-accent font-semibold text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('size-2 rounded-full bg-sidebar-foreground/50', isActive && 'bg-sidebar-active')} />
                  {i.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
      {invite && <TelegramFooter invite={invite} />}
    </nav>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { token, employee } = useSession()
  const remind = useRemindMe()
  const me = remind.me
  const name = employee?.full_name || me?.name || 'Karyawan'
  const mark = (on: boolean) => (on ? '✅' : '–')
  const section = SECTIONS.find((s) => s.items.some((i) => i.to === pathname))
  const item = section?.items.find((i) => i.to === pathname)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-[210px] lg:block">
        <Rail invite={me?.invite} admin={isSuperadmin(employee)} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[210px] border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigasi utama</SheetDescription>
          <Rail invite={me?.invite} admin={isSuperadmin(employee)} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="lg:pl-[210px]">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-card px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          {section && item && (
            <span className="text-[13px] text-muted-foreground">
              {section.title} / {item.crumb}
            </span>
          )}
          <span className="flex-1" />
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{today()}</span>
          <ThemeToggle />
          {(token || me) && <DropdownMenu onOpenChange={(o) => { if (o) void remind.reload() }}>
            <DropdownMenuTrigger
              aria-label="Menu akun"
              className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary-ink"
            >
              {initials(name)}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-semibold">{name}</div>
                <div className="text-xs text-muted-foreground">
                  {[employee?.nik, employee?.branch_name].filter(Boolean).join(' · ')}
                </div>
              </DropdownMenuLabel>
              {me && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="font-normal">
                    <div className="text-xs font-semibold text-muted-foreground">Pengingat Telegram</div>
                    <div className="text-sm">{`Shelia ${mark(me.shelia)} · MagangHub ${mark(me.maganghub)}`}</div>
                  </DropdownMenuLabel>
                  {me.admin && (
                    <DropdownMenuCheckboxItem checked={me.holiday}
                      onCheckedChange={async (on) => { await remindHoliday(todayWIB(), on); await remind.reload() }}>
                      Libur hari ini
                    </DropdownMenuCheckboxItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>}
        </header>
        <main className="flex flex-col gap-4 p-5">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}
