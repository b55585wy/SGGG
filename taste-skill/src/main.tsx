import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import GeneratePage from './pages/Generate'
import PreviewPage from './pages/Preview'
import ReaderPage from './pages/Reader'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import ProtectedRoute from './components/ProtectedRoute'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <main className="min-h-screen bg-[var(--color-background)]">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><GeneratePage /></ProtectedRoute>} />
          <Route path="/preview" element={<ProtectedRoute><PreviewPage /></ProtectedRoute>} />
          <Route path="/reader" element={<ProtectedRoute><ReaderPage /></ProtectedRoute>} />
        </Routes>
      </main>
    </BrowserRouter>
  </StrictMode>,
)
