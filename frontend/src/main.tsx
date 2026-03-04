import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import ReaderPage from './pages/Reader'

import NcLoginPage from './pages/noa/NcLoginPage'
import AvatarPage from './pages/noa/AvatarPage'
import NcHomePage from './pages/noa/HomePage'
import BookCreatePage from './pages/noa/BookCreatePage'
import BookDetailPage from './pages/noa/BookDetailPage'
import BookHistoryPage from './pages/noa/BookHistoryPage'
import AdminUsersPage from './pages/noa/AdminUsersPage'
import NcRequireAuth from './pages/noa/NcRequireAuth'
import NcRouteTracker from './pages/noa/NcRouteTracker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NcRouteTracker>
        <main className="min-h-screen bg-[var(--color-background)]">
          <Routes>
            <Route path="/" element={<Navigate to="/noa/login" replace />} />

            <Route path="/noa/login" element={<NcLoginPage />} />
            <Route path="/noa/admin/users" element={<AdminUsersPage />} />
            <Route path="/noa/avatar" element={<NcRequireAuth><AvatarPage /></NcRequireAuth>} />
            <Route path="/noa/home" element={<NcRequireAuth><NcHomePage /></NcRequireAuth>} />
            <Route path="/noa/books/create" element={<NcRequireAuth><BookCreatePage /></NcRequireAuth>} />
            <Route path="/noa/books/history" element={<NcRequireAuth><BookHistoryPage /></NcRequireAuth>} />
            <Route path="/noa/books/:bookId" element={<NcRequireAuth><BookDetailPage /></NcRequireAuth>} />

            <Route path="/reader" element={<NcRequireAuth><ReaderPage /></NcRequireAuth>} />

            <Route path="*" element={<Navigate to="/noa/login" replace />} />
          </Routes>
        </main>
      </NcRouteTracker>
    </BrowserRouter>
  </StrictMode>,
)
