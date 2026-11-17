import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import Absen from '@/pages/Absen'
import Riwayat from '@/pages/Riwayat'
import LogApi from '@/pages/LogApi'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Absen />} />
        <Route path="/riwayat" element={<Riwayat />} />
        <Route path="/riwayat-shelia" element={<Navigate to="/riwayat" replace />} />
        <Route path="/riwayat-maganghub" element={<Navigate to="/riwayat" replace />} />
        <Route path="/log-api" element={<LogApi />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
