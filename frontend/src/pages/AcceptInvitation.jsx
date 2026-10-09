import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { theme } from '../theme'
import { useTranslation } from 'react-i18next'

const ROLE_LABELS = { admin: 'Admin', confirmateur: 'Confirmateur', dropshipper: 'Dropshipper' }

export default function AcceptInvitation() {
  const { t, t: tr } = useTranslation('dashboard')
  const [params] = useSearchParams()
  const navigate  = useNavigate()
  const token     = params.get('token') || ''

  const [info, setInfo]       = useState(null)
  const [invalid, setInvalid] = useState(false)
  const [form, setForm]       = useState({ password: '', confirm: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) { setInvalid(true); return }
    api.get(`/team/accept-invitation/?token=${token}`)
      .then(({ data }) => setInfo(data))
      .catch(() => setInvalid(true))
  }, [token])

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError(t('Les mots de passe ne correspondent pas.'))
      return
    }
    setLoading(true)
    try {
      await api.post('/team/accept-invitation/', { token, password: form.password })
      navigate('/auth?activated=1')
    } catch (err) {
      setError(err.response?.data?.detail || t('Une erreur est survenue.'))
    } finally {
      setLoading(false)
    }
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-app">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-app-primary text-lg font-semibold">{t('Lien invalide ou déjà utilisé')}</p>
          <button onClick={() => navigate('/auth')}
            className={`mt-4 ${theme.btn.ghost}`}>{t('Retour à la connexion')}</button>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-app">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 text-violet-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-app-muted-light text-sm">{t('Vérification du lien…')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen font-sans">

      {/* ─── Formulaire ─── */}
      <div className="w-full lg:w-[55%] flex flex-col px-6 py-12 sm:px-16 overflow-y-auto bg-app">
        <div className="w-full max-w-sm mx-auto lg:mx-0 flex flex-col flex-1 justify-center">

          <p className={`text-2xl font-bold tracking-tight mb-2 ${theme.logo}`}>{t('MZSolutions')}</p>
          <p className="text-sm text-app-muted-light mb-8">{t('Activation de votre compte')}</p>

          <div className={`${theme.panel} mb-6`}>
            <p className="text-app-primary text-sm">{t('Bonjour')}{' '}<span className="text-app-primary font-semibold">{info.first_name} {info.last_name}</span>,
            </p>
            <p className="text-app-muted-light text-sm mt-1">{t('Vous avez été invité(e) à rejoindre')}<span className="text-app-accent font-medium">{info.store_name}</span>{t('en tant que')}<span className="text-app-accent font-medium">{ROLE_LABELS[info.role]}</span>.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className={theme.label}>{t('Mot de passe *')}</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                minLength={8}
                className={theme.authInput}
                placeholder={t('Minimum 8 caractères')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={theme.label}>{t('Confirmer le mot de passe *')}</label>
              <input
                type="password"
                name="confirm"
                value={form.confirm}
                onChange={handleChange}
                required
                className={theme.authInput}
                placeholder={t('Répétez le mot de passe')}
              />
            </div>

            {error && (
              <p className="text-sm text-app-danger bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}
              className={`w-full py-3 text-sm ${theme.btn.primary}`}>
              {loading ? tr('Activation…') : t('Activer mon compte')}
            </button>
          </form>
        </div>
      </div>

      {/* ─── Hero ─── */}
      <div className={`hidden lg:flex lg:w-[45%] ${theme.hero} items-center justify-center px-12 sticky top-0 h-screen`}>
        <div className="text-white max-w-sm">
          <span className="inline-block bg-white/10 border border-white/20 text-white/90 text-xs font-medium px-3 py-1 rounded-full mb-6">{t('Invitation d\'équipe')}</span>
          <h1 className="text-[2rem] font-bold leading-snug mb-5">{t('Rejoignez l\'équipe de {{store_name}}', { store_name: info.store_name })}</h1>
          <p className="text-white/75 text-sm leading-relaxed mb-8">{t('Activez votre compte pour accéder au tableau de bord et commencer à collaborer.')}</p>
          <ul className="space-y-3">
            {[
              t('Accès sécurisé selon votre rôle'),
              t('Collaboration en temps réel'),
              t('Suivi des commandes et du stock'),
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
