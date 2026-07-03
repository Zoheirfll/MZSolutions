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
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">Lien invalide.</p>
          <Link to="/forgot-password" className="text-violet-600 hover:underline text-sm transition-colors duration-200">
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen font-sans">

      {/* ─── Formulaire ─── */}
      <div className="w-full lg:w-[55%] flex flex-col px-6 py-12 sm:px-16 overflow-y-auto bg-white">
        <div className="w-full max-w-sm mx-auto lg:mx-0 flex flex-col flex-1 justify-center">

          <p className={`text-2xl font-bold tracking-tight mb-10 ${theme.logo}`}>MZSolutions</p>

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
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Nouveau mot de passe</h2>
                <p className="text-sm text-gray-500">Choisissez un nouveau mot de passe sécurisé.</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className={theme.label}>Nouveau mot de passe *</label>
                  <input type="password" placeholder="Minimum 8 caractères" className={theme.input}
                    value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={theme.label}>Confirmer le mot de passe *</label>
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

      {/* ─── Hero ─── */}
      <div className={`hidden lg:flex lg:w-[45%] ${theme.hero} items-center justify-center px-12 sticky top-0 h-screen`}>
        <div className="text-white max-w-sm">
          <span className="inline-block bg-white/10 border border-white/20 text-white/90 text-xs font-medium px-3 py-1 rounded-full mb-6">
            Sécurité du compte
          </span>
          <h1 className="text-[2rem] font-bold leading-snug mb-5">
            Choisissez un mot de passe robuste
          </h1>
          <p className="text-white/75 text-sm leading-relaxed mb-8">
            Un bon mot de passe protège votre boutique et les données de vos clients.
          </p>
          <ul className="space-y-3">
            {[
              'Minimum 8 caractères',
              'Évitez les mots de passe déjà utilisés',
              'Combinez lettres, chiffres et symboles',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-white/85 text-sm">
                <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

    </div>
  )
}
