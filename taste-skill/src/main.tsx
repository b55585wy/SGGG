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
      <main className="max-w-lg mx-auto px-4 py-6 min-h-[100dvh]">
        <Routes>
          <Route path="/" element={<GeneratePage />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/reader" element={<ReaderPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  </StrictMode>,
)
