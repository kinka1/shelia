import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import Absen from '@/pages/Absen'
import RiwayatShelia from '@/pages/RiwayatShelia'
import RiwayatMagangHub from '@/pages/RiwayatMagangHub'
import LogApi from '@/pages/LogApi'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Absen />} />
        <Route path="/riwayat-shelia" element={<RiwayatShelia />} />
        <Route path="/riwayat-maganghub" element={<RiwayatMagangHub />} />
        <Route path="/log-api" element={<LogApi />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
