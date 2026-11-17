import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { SessionProvider } from '@/features/session/SessionProvider'
import { initTheme } from '@/lib/theme'
import { intakeTokenFromLocation } from '@/lib/maganghub'

initTheme()
intakeTokenFromLocation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
