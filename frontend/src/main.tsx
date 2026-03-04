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

import NcLoginPage from './pages/noa/NcLoginPage'
import AvatarPage from './pages/noa/AvatarPage'
import NcHomePage from './pages/noa/HomePage'
import BookCreatePage from './pages/noa/BookCreatePage'
import BookDetailPage from './pages/noa/BookDetailPage'
import BookHistoryPage from './pages/noa/BookHistoryPage'
import AdminUsersPage from './pages/noa/AdminUsersPage'

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

          <Route path="/noa/login" element={<NcLoginPage />} />
          <Route path="/noa/avatar" element={<AvatarPage />} />
          <Route path="/noa/home" element={<NcHomePage />} />
          <Route path="/noa/books/create" element={<BookCreatePage />} />
          <Route path="/noa/books/history" element={<BookHistoryPage />} />
          <Route path="/noa/books/:bookId" element={<BookDetailPage />} />
          <Route path="/noa/admin/users" element={<AdminUsersPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  </StrictMode>,
)
