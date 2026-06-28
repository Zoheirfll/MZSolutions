import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { theme } from '../theme'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/password-reset/', { email })
      setSent(true)
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-md">

        <Link to="/auth" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-violet-600 transition mb-8">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour à la connexion
        </Link>

        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Email envoyé !</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Si <span className="font-medium text-gray-700">{email}</span> correspond à un compte,
              vous recevrez un lien de réinitialisation dans quelques minutes.
            </p>
            <p className="text-xs text-gray-400 mt-4">Pensez à vérifier vos spams.</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className={`text-2xl font-bold mb-1 ${theme.logo}`}>MZSolutions</h1>
              <h2 className="text-lg font-semibold text-gray-900 mt-4 mb-1">Mot de passe oublié ?</h2>
              <p className="text-sm text-gray-500">
                Entrez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  placeholder="votre@email.com"
                  className={theme.input}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading}
                className={`w-full py-3 text-sm ${theme.btn.primary}`}>
                {loading ? 'Envoi...' : 'Envoyer le lien de réinitialisation'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
