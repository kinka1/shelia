import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  clearSession, getEmployee, getToken, onUnauthorized, saveSession, sheliaApi, type Employee,
} from '@/lib/shelia'

interface Session {
  token: string | null
  employee: Employee | null
  login: (nik: string, pw: string) => Promise<void>
  logout: () => Promise<void>
  expiredMessage: string
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
    const e = res.data?.employee || {}
    const emp = { full_name: e.full_name, nik: e.nik, branch_name: e.branch_name }
    saveSession(res.data?.token || '', emp)
    setEmployee(emp)
    setToken(getToken())
    setExpired('')
  }, [])

  const logout = useCallback(async () => {
    try {
      await sheliaApi('/auth/logout', { method: 'POST', action: 'Keluar dari akun' })
    } catch { /* sesi tetap dihapus walau request gagal */ }
    clearSession()
    setToken(null)
    setEmployee(null)
    setExpired('')
  }, [])

  const value = useMemo(
    () => ({ token, employee, login, logout, expiredMessage }),
    [token, employee, login, logout, expiredMessage],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
