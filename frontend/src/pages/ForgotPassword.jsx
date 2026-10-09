import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { theme } from '../theme'
import { useTranslation } from 'react-i18next'

export default function ForgotPassword() {
  const { t, t: tr } = useTranslation('dashboard')
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
      setError(t('Une erreur est survenue. Réessayez.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen font-sans">

      {/* ─── Formulaire ─── */}
      <div className="w-full lg:w-[55%] flex flex-col px-6 py-12 sm:px-16 overflow-y-auto bg-app">
        <div className="w-full max-w-sm mx-auto lg:mx-0 flex flex-col flex-1 justify-center">

          <p className={`text-2xl font-bold tracking-tight mb-10 ${theme.logo}`}>{t('MZSolutions')}</p>

          <Link to="/auth" className="inline-flex items-center gap-1.5 text-sm text-app-muted-light hover:text-app-accent transition-colors duration-200 mb-8 w-fit">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>{t('Retour à la connexion')}</Link>

          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-app-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-app-primary mb-2">{t('Email envoyé !')}</h2>
              <p className="text-app-muted-light text-sm leading-relaxed">{t('Si')}{' '}<span className="font-medium text-app-primary">{email}</span>{' '}{t('correspond à un compte, vous recevrez un lien de réinitialisation dans quelques minutes.')}</p>
              <p className="text-xs text-app-muted-light mt-4">{t('Pensez à vérifier vos spams.')}</p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-app-primary mb-1">{t('Mot de passe oublié ?')}</h2>
                <p className="text-sm text-app-muted-light">{t('Entrez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.')}</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className={theme.label}>{t('Email')}</label>
                  <input
                    type="email"
                    placeholder={t('votre@email.com')}
                    className={theme.authInput}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-app-danger bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading}
                  className={`w-full py-3 text-sm ${theme.btn.primary}`}>
                  {loading ? tr('Envoi...') : t('Envoyer le lien de réinitialisation')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* ─── Hero ─── */}
      <div className={`hidden lg:flex lg:w-[45%] ${theme.hero} items-center justify-center px-12 sticky top-0 h-screen`}>
        <div className="text-white max-w-sm">
          <span className="inline-block bg-white/10 border border-white/20 text-white/90 text-xs font-medium px-3 py-1 rounded-full mb-6">{t('Sécurité du compte')}</span>
          <h1 className="text-[2rem] font-bold leading-snug mb-5">{t('Récupérez l\'accès à votre boutique en toute sécurité')}</h1>
          <p className="text-white/75 text-sm leading-relaxed mb-8">{t('Un lien de réinitialisation valable une durée limitée vous sera envoyé par email pour protéger votre compte.')}</p>
          <ul className="space-y-3">
            {[
              t('Lien sécurisé à usage unique'),
              t('Expiration automatique'),
              t('Aucune donnée partagée'),
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
