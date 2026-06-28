import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [quota, setQuota] = useState(null)

  useEffect(() => {
    api.get('/stores/me/quota/')
      .then(({ data }) => setQuota(data))
      .catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/auth')
  }

  const usedPct = quota ? Math.round((quota.orders_used / quota.orders_limit) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-8 py-4 flex justify-between items-center shadow-sm">
        <span className={`text-xl font-bold tracking-tight ${theme.logo}`}>MZSolutions</span>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center font-semibold text-xs">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </div>
            <span className="font-medium text-gray-700">{user?.first_name} {user?.last_name}</span>
          </div>
          <button onClick={handleLogout}
            className={`px-4 py-1.5 text-xs ${theme.btn.outline}`}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Bonjour, {user?.first_name} 👋
        </h1>
        <p className="text-gray-500 text-sm mb-10">Bienvenue sur votre espace vendeur MZSolutions.</p>

        {/* Quota card */}
        {quota && (
          <div className="bg-white border border-gray-100 rounded-2xl p-7 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-semibold text-gray-900">Quota d'essai gratuit</h2>
                <p className="text-xs text-gray-400 mt-0.5">Votre période d'essai</p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                quota.is_trial_active ? theme.badge.success : theme.badge.danger
              }`}>
                {quota.is_trial_active ? '● Actif' : '● Expiré'}
              </span>
            </div>

            <div className="flex gap-8 mb-6">
              {[
                { val: quota.orders_remaining, label: 'Restantes', color: 'text-violet-600' },
                { val: quota.orders_used,      label: 'Utilisées',  color: 'text-gray-700' },
                { val: quota.orders_limit,     label: 'Total',      color: 'text-gray-400' },
              ].map(({ val, label, color }) => (
                <div key={label}>
                  <p className={`text-3xl font-bold ${color}`}>{val}</p>
                  <p className="text-xs text-gray-400 mt-1">{label}</p>
                </div>
              ))}
            </div>

            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${usedPct}%` }}
              />
            </div>

            <p className="text-xs text-gray-400">
              Essai valable jusqu'au{' '}
              <span className="font-medium text-gray-600">
                {new Date(quota.trial_ends_at).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            </p>
          </div>
        )}

        {/* Coming soon */}
        <div className="bg-violet-50 border border-violet-100 rounded-xl px-6 py-5 text-violet-700 text-sm flex items-center gap-3">
          <span className="text-xl">🚀</span>
          <span><span className="font-semibold">Sprint 2 en cours :</span> gestion des produits et catégories</span>
        </div>
      </main>
    </div>
  )
}
