import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PrivateRoute from './PrivateRoute'

// DEUX espaces séparés, deux accès distincts (jamais l'un par héritage de l'autre) :
//   - /platform-admin/*  = SERVICE DE CONFIRMATION (boutiques clientes, confirmateurs) → `is_service_admin`
//   - /plateforme/*      = ADMINISTRATION DE LA PLATEFORME (comptes, paiements, réglages…) → `platform_level`
// Complètement indépendants du système de permissions par boutique (team.RolePermission).

// Garde de l'administration de la plateforme (admin ou superadmin).
export default function PlatformAdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!user.platform_level) return <Navigate to={user.is_service_admin ? '/platform-admin/boutiques' : '/dashboard'} replace />
  return children
}

// Niveau superadmin de la plateforme : prix, réglages, remboursements, gestion des admins.
function PlatformSuperadminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (user.platform_level !== 'superadmin') return <Navigate to="/plateforme" replace />
  return children
}

export function PSA({ children }) {
  return (
    <PrivateRoute>
      <PlatformSuperadminRoute>{children}</PlatformSuperadminRoute>
    </PrivateRoute>
  )
}

// Garde du service de confirmation (opérateur du service uniquement).
function ServiceAdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!user.is_service_admin) return <Navigate to={user.platform_level ? '/plateforme' : '/dashboard'} replace />
  return children
}

export function PS({ children }) {
  return (
    <PrivateRoute>
      <ServiceAdminRoute>{children}</ServiceAdminRoute>
    </PrivateRoute>
  )
}

export function PA({ children }) {
  return (
    <PrivateRoute>
      <PlatformAdminRoute>{children}</PlatformAdminRoute>
    </PrivateRoute>
  )
}

// Garde distincte pour la file de travail (V2) : un confirmateur du
// superadmin n'est PAS un superadmin (is_platform_admin) — il n'a accès
// qu'à sa propre file, jamais à la gestion des boutiques/confirmateurs.
function PlatformConfirmateurRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!user.is_platform_confirmateur) return <Navigate to="/dashboard" replace />
  return children
}

export function PC({ children }) {
  return (
    <PrivateRoute>
      <PlatformConfirmateurRoute>{children}</PlatformConfirmateurRoute>
    </PrivateRoute>
  )
}
