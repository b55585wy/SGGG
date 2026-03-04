import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function NcRouteTracker({ children }: { children: React.ReactElement }) {
  const location = useLocation()
  useEffect(() => {
    sessionStorage.setItem('lastPath', location.pathname)
  }, [location.pathname])
  return children
}
