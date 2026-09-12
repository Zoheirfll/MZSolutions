import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PrivateRoute from './PrivateRoute'

// Garde d'accès à l'espace superadmin (/platform-admin/*) — complètement
// indépendant du système de permissions par boutique (team.RolePermission) :
// ce compte n'appartient à aucun Store, seul accounts.User.is_platform_admin
// donne accès.
export default function PlatformAdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!user.is_platform_admin) return <Navigate to="/dashboard" replace />
  return children
}

export function PA({ children }) {
  return (
    <PrivateRoute>
      <PlatformAdminRoute>{children}</PlatformAdminRoute>
    </PrivateRoute>
  )
}
