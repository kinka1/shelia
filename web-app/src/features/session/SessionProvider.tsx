import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ApiError, clearSession, getEmployee, getToken, isSuperadmin, onUnauthorized, saveSession, sheliaApi, type Employee,
} from '@/lib/shelia'
import { remindPlatforms } from '@/lib/remindApi'

interface Session {
  token: string | null
  employee: Employee | null
  login: (nik: string, pw: string) => Promise<void>
  logout: () => Promise<void>
  expiredMessage: string
  /** null while /me/access is still being asked. */
  superadmin: boolean | null
}

const Ctx = createContext<Session | null>(null)

export function useSession(): Session {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSession di luar SessionProvider')
  return c
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(getToken)
  const [employee, setEmployee] = useState(getEmployee)
  const [expiredMessage, setExpired] = useState('')
  const [rbacAdmin, setRbacAdmin] = useState<boolean | null>(null)

  // Superadmin may come from the RBAC roles table only (role_name then reads e.g. "Administrator").
  useEffect(() => {
    if (!token || isSuperadmin(employee)) return
    let live = true
    setRbacAdmin(null)
    sheliaApi<{ data?: { roles?: unknown } }>('/me/access?platform=web', { action: 'Cek akses' })
      .then((b) => live && setRbacAdmin(Array.isArray(b.data?.roles) && b.data.roles.includes('Superadmin')))
      .catch(() => live && setRbacAdmin(false))
    return () => { live = false }
  }, [token, employee])
  const superadmin = !token ? false : isSuperadmin(employee) ? true : rbacAdmin

  useEffect(
    () => onUnauthorized(() => {
      setToken(null)
      setEmployee(null)
      setExpired('Sesi berakhir. Silakan login lagi.')
    }),
    [],
  )

  const login = useCallback(async (nik: string, pw: string) => {
    const res = await sheliaApi('/auth/login', {
      method: 'POST', json: { username: nik, password: pw }, auth: false, action: 'Masuk ke akun',
    })
    if (!res.data?.token) throw new ApiError('Login gagal: token tidak diterima.')
    const e = res.data?.employee || {}
    const emp = { full_name: e.full_name, nik: e.nik, branch_name: e.branch_name, role_name: e.role_name }
    saveSession(res.data.token, emp)
    setEmployee(emp)
    setToken(getToken())
    setExpired('')
  }, [])

  const logout = useCallback(async () => {
    try {
      await sheliaApi('/auth/logout', { method: 'POST', action: 'Keluar dari akun' })
    } catch { /* sesi tetap dihapus walau request gagal */ }
    clearSession(true)
    void remindPlatforms({ shelia: false }) // Keluar: off the Telegram table's Shelia column
    setToken(null)
    setEmployee(null)
    setExpired('')
  }, [])

  const value = useMemo(
    () => ({ token, employee, login, logout, expiredMessage, superadmin }),
    [token, employee, login, logout, expiredMessage, superadmin],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
