import { Navigate } from 'react-router-dom'
import { getToken } from '@/lib/auth'

export default function NcRequireAuth({ children }: { children: React.ReactElement }) {
  const token = getToken()
  if (!token) return <Navigate to="/noa/login" replace />
  return children
}
