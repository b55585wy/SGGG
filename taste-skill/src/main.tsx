import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import GeneratePage from './pages/Generate'
import PreviewPage from './pages/Preview'
import ReaderPage from './pages/Reader'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <main className="min-h-screen bg-[var(--color-background)]">
        <Routes>
          <Route path="/" element={<GeneratePage />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/reader" element={<ReaderPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  </StrictMode>,
)
