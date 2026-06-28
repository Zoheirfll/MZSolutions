import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import StorePage from './pages/StorePage'
import ComingSoon from './pages/ComingSoon'
import TeamPage from './pages/TeamPage'
import AcceptInvitation from './pages/AcceptInvitation'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

function PrivateDash({ children }) {
  return <PrivateRoute>{children}</PrivateRoute>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/dashboard" element={<PrivateDash><Dashboard /></PrivateDash>} />
          <Route path="/dashboard/boutique" element={<PrivateDash><StorePage /></PrivateDash>} />
          <Route path="/dashboard/produits" element={<PrivateDash><ComingSoon title="Produits & Catégories" /></PrivateDash>} />
          <Route path="/dashboard/commandes" element={<PrivateDash><ComingSoon title="Commandes" /></PrivateDash>} />
          <Route path="/dashboard/clients" element={<PrivateDash><ComingSoon title="Clients" /></PrivateDash>} />
          <Route path="/dashboard/expeditions" element={<PrivateDash><ComingSoon title="Expéditions & Retours" /></PrivateDash>} />
          <Route path="/dashboard/stats" element={<PrivateDash><ComingSoon title="Statistiques" /></PrivateDash>} />
          <Route path="/dashboard/equipe" element={<PrivateDash><TeamPage /></PrivateDash>} />
          <Route path="/dashboard/abonnement" element={<PrivateDash><ComingSoon title="Abonnement" /></PrivateDash>} />

          <Route path="/accept-invitation" element={<AcceptInvitation />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
