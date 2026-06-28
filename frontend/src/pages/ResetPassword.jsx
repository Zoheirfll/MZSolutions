import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/axios'
import { theme } from '../theme'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const uid = params.get('uid') || ''
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/password-reset/confirm/', { uid, token, new_password: password })
      setDone(true)
      setTimeout(() => navigate('/auth'), 2500)
    } catch (err) {
      setError(err.response?.data?.detail || 'Lien invalide ou expiré.')
    } finally {
      setLoading(false)
    }
  }

  if (!uid || !token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Lien invalide.</p>
          <Link to="/forgot-password" className="text-violet-600 hover:underline text-sm">
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-md">

        {done ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Mot de passe mis à jour !</h2>
            <p className="text-sm text-gray-500">Redirection vers la page de connexion...</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className={`text-2xl font-bold mb-1 ${theme.logo}`}>MZSolutions</h1>
              <h2 className="text-lg font-semibold text-gray-900 mt-4 mb-1">Nouveau mot de passe</h2>
              <p className="text-sm text-gray-500">Choisissez un nouveau mot de passe sécurisé.</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Nouveau mot de passe *</label>
                <input type="password" placeholder="Minimum 8 caractères" className={theme.input}
                  value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Confirmer le mot de passe *</label>
                <input type="password" placeholder="Répétez le mot de passe" className={theme.input}
                  value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {error}
                  {error.includes('expiré') && (
                    <Link to="/forgot-password"
                      className="block mt-1 text-violet-600 font-medium underline text-xs">
                      Demander un nouveau lien
                    </Link>
                  )}
                </p>
              )}

              <button type="submit" disabled={loading}
                className={`w-full py-3 text-sm ${theme.btn.primary}`}>
                {loading ? 'Enregistrement...' : 'Réinitialiser le mot de passe'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
