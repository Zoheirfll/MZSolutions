import { useState, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import Logo from '../components/Logo'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../hooks/useTheme'
import { theme } from '../theme'
import { useTranslation } from 'react-i18next'

function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="block text-sm font-medium text-app-primary mb-0.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-app-danger flex items-center gap-1">{error}</p>}
    </div>
  )
}

function GoogleButton({ onClick, loading, children }) {
  const { t: tr } = useTranslation('dashboard')
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-(--border-color-hover)
        rounded-xl bg-app-card hover:bg-violet-500/10 active:bg-app-card-alt text-app-primary text-sm font-medium
        transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none cursor-pointer
        shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
      {!loading ? (
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.8 18.9 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.4-5.1l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.4 4.3-4.4 5.7l6.2 5.2C36.9 39.1 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
        </svg>
      ) : (
        <svg className="w-4 h-4 animate-spin text-app-muted-light" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
        </svg>
      )}
      {loading ? tr('Connexion...') : children}
    </button>
  )
}

// Le tableau de bord analytique (/dashboard) nécessite stats_view — masqué
// par défaut pour confirmateur/dropshipper (matrice de permissions Epic 7.5).
// Sans ce garde-fou, ces rôles atterrissaient après connexion sur une page
// qui leur envoie des requêtes 403/404 en boucle et affiche "Impossible de
// charger les statistiques" — on les redirige vers une page qu'ils peuvent
// réellement utiliser.
function landingPathFor(user) {
  // Un compte superadmin (platform_admin) ou un confirmateur du service de
  // confirmation n'a le plus souvent aucune boutique (pas de Store/team_membership)
  // — /dashboard planterait ou n'aurait rien à afficher. Prioritaire sur les
  // autres cas puisque ces comptes n'ont normalement pas de team_role.
  if (user?.is_service_admin) return '/platform-admin/boutiques'
  if (user?.platform_level) return '/plateforme/apercu'
  if (user?.is_platform_confirmateur) return '/platform-admin/ma-file'
  // /dashboard affiche un tableau de bord dédié (commandes assignées) pour
  // un confirmateur sans stats_view — donc toujours accessible pour lui.
  // Seul le dropshipper n'a aucune variante de /dashboard qui lui convienne.
  if (user?.team_role === 'dropshipper' && !user?.permissions?.stats_view) return '/dashboard/mes-produits'
  return '/dashboard'
}

// Après connexion : un compte superuser de l'admin Django SANS boutique ni rôle plateforme
// (ex. le compte technique) arrive sur /admin/ (page serveur, hors du routeur React) au
// lieu d'un dashboard vendeur vide. Tous les autres cas gardent leur page d'arrivée.
function goAfterAuth(navigate, user) {
  if (user?.is_django_admin && !user.store_slug && !user.team_role && !user.platform_level && !user.is_service_admin && !user.is_platform_confirmateur) {
    window.location.assign('/admin/')
    return
  }
  navigate(landingPathFor(user))
}

function StepIndicator({ step, total, label }) {
  return (
    <div className="flex items-center gap-2 self-start mb-1">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i < step ? 'w-6 bg-violet-600' : 'w-3 bg-app-card-alt'}`} />
      ))}
      <span className="text-xs font-medium text-app-muted-light ms-1">{label}</span>
    </div>
  )
}

function VerifyEmailStep({ email, onVerified }) {
  const { t: tr } = useTranslation('dashboard')
  const [codes, setCodes] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()]

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...codes]; next[i] = val; setCodes(next)
    if (val && i < 5) refs[i + 1].current?.focus()
  }
  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !codes[i] && i > 0) refs[i - 1].current?.focus()
  }
  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) { setCodes(pasted.split('')); refs[5].current?.focus() }
  }
  const handleVerify = async () => {
    const code = codes.join('')
    if (code.length < 6) return
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-email/', { email, code })
      onVerified(data.user)
    } catch (err) {
      setError(err.response?.data?.detail || tr('Code incorrect.'))
    } finally { setLoading(false) }
  }
  const handleResend = async () => {
    setResent(false)
    try {
      await api.post('/auth/resend-verification/', { email })
      setResent(true); setCodes(['', '', '', '', '', '']); refs[0].current?.focus()
    } catch {}
  }

  return (
    <div className="flex flex-col items-center gap-5 max-w-sm text-center">
      <StepIndicator step={2} total={2} label={tr('Étape 2 sur 2')} />
      <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center shadow-sm">
        <svg className="w-8 h-8 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-bold text-app-primary mb-1">{tr('Vérifiez votre email')}</h2>
        <p className="text-sm text-app-muted-light">{tr('Code à 6 chiffres envoyé à')}<br />
          <span className="font-semibold text-app-accent">{email}</span>
        </p>
      </div>

      <div className="flex gap-2.5" onPaste={handlePaste}>
        {codes.map((c, i) => (
          <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={c}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className={`w-11 h-13 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all duration-200
              ${c ? 'border-violet-500 bg-violet-500/10 text-app-accent' : 'border-(--border-color-hover) bg-app-card text-app-primary'}
              focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25`}
          />
        ))}
      </div>

      {error && <p className="text-app-danger text-sm bg-red-500/10 px-4 py-2 rounded-xl w-full">{error}</p>}
      {resent && <p className="text-app-success text-sm bg-emerald-500/10 px-4 py-2 rounded-xl w-full">{tr('Nouveau code envoyé !')}</p>}

      <button onClick={handleVerify} disabled={loading || codes.join('').length < 6}
        className={`w-full py-3 ${theme.btn.primary}`}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>{tr('Vérification...')}</span>
        ) : tr('Vérifier le code')}
      </button>

      <p className="text-sm text-app-muted-light">{tr('Pas reçu le code ?')}<button onClick={handleResend} className="text-app-accent font-semibold hover:underline cursor-pointer">{tr('Renvoyer')}</button>
      </p>
    </div>
  )
}

function GoogleStoreStep({ googleToken, userInfo, onDone }) {
  const { t: tr } = useTranslation('dashboard')
  const [storeName, setStoreName] = useState('')
  const [storeSlug, setStoreSlug] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const autoSlug = (n) => n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/google/register/', {
        access_token: googleToken, store_name: storeName, store_slug: storeSlug,
      })
      onDone(data.user)
    } catch (err) {
      setError(err.response?.data?.detail || tr('Erreur lors de la création du compte.'))
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm w-full">
      <StepIndicator step={2} total={2} label={tr('Dernière étape')} />
      <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/25 rounded-xl px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
          {userInfo.name[0]}
        </div>
        <div className="text-sm min-w-0">
          <p className="font-semibold text-app-primary truncate">{userInfo.name}</p>
          <p className="text-app-muted-light text-xs truncate">{userInfo.email}</p>
        </div>
      </div>
      <p className="text-sm text-app-muted-light font-medium">{tr('Plus qu\'une étape — nommez votre boutique :')}</p>
      <Field label={tr('Nom de la boutique *')}>
        <input type="text" placeholder={tr('Ma Super Boutique')} className={theme.authInput}
          value={storeName} onChange={e => { setStoreName(e.target.value); setStoreSlug(autoSlug(e.target.value)) }} required />
      </Field>
      <Field label={tr('URL de la boutique *')}>
        <div className="flex border border-(--border-color-hover) rounded-xl overflow-hidden focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/25 transition">
          <span className="px-3 py-2.5 bg-violet-500/10 text-app-accent text-xs border-e border-(--border-color-hover) whitespace-nowrap flex items-center font-medium">{tr('mzsolutions.app/')}</span>
          <input type="text" placeholder={tr('ma-boutique')}
            className="flex-1 px-3 py-2.5 text-sm text-app-primary outline-none bg-app-card"
            value={storeSlug} onChange={e => setStoreSlug(autoSlug(e.target.value))} required />
        </div>
      </Field>
      {error && <p className="text-app-danger text-sm bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-2.5">{error}</p>}
      <button type="submit" disabled={loading} className={`w-full py-3 ${theme.btn.primary}`}>
        {loading ? tr('Création...') : tr('Créer ma boutique')}
      </button>
    </form>
  )
}

export default function Auth() {
  const { t: tr } = useTranslation('dashboard')
  const [searchParams] = useSearchParams()
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  const { theme: mode, toggleTheme } = useTheme(systemTheme)
  const [tab, setTab] = useState(searchParams.get('tab') === 'register' ? 'register' : 'login')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [pendingEmail, setPendingEmail] = useState(null)
  const [googleStep, setGoogleStep] = useState(null)
  const { login, setUser } = useAuth()
  const navigate = useNavigate()
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    email: '', first_name: '', last_name: '', phone: '',
    store_name: '', store_slug: '', password: '',
  })

  const switchTab = (t) => { setTab(t); setErrors({}); setPendingEmail(null); setGoogleStep(null) }
  const autoSlug = (n) => n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const handleLogin = async (e) => {
    e.preventDefault(); setErrors({}); setLoading(true)
    try {
      const { user } = await login(loginForm.email, loginForm.password); goAfterAuth(navigate, user)
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'email_not_verified') {
        setErrors({ general: data.detail, email_not_verified: true, email: data.email })
      } else if (!err.response) {
        // Pas de réponse du serveur = problème réseau (mauvaise URL API,
        // hors ligne, navigateur intégré Instagram/Facebook qui bloque la
        // requête...) — ne jamais afficher "Identifiants invalides" dans ce
        // cas, ça égare complètement le diagnostic.
        setErrors({ general: tr('Impossible de contacter le serveur. Vérifiez votre connexion, ou essayez depuis Chrome/Safari si vous êtes dans le navigateur d\'une autre app (Instagram, Facebook...).') })
      } else {
        setErrors({ general: data?.detail || data?.non_field_errors?.[0] || tr('Identifiants invalides.') })
      }
    } finally { setLoading(false) }
  }

  const handleRegister = async (e) => {
    e.preventDefault(); setErrors({}); setLoading(true)
    try {
      const { data } = await api.post('/auth/register/', registerForm)
      if (data.pending_verification) setPendingEmail(data.email)
    } catch (err) {
      const data = err.response?.data || {}
      const mapped = {}
      Object.entries(data).forEach(([k, v]) => { mapped[k] = Array.isArray(v) ? v[0] : v })
      setErrors(mapped)
    } finally { setLoading(false) }
  }

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResp) => {
      setGLoading(true)
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResp.access_token}` },
        })
        const userInfo = await userInfoRes.json()
        const { data } = await api.post('/auth/google/login/', { access_token: tokenResp.access_token })
        setUser(data.user); goAfterAuth(navigate, data.user)
      } catch (err) {
        if (err.response?.status === 404) {
          setErrors({ general: tr('Aucun compte Google associé. Veuillez vous inscrire d\'abord.') })
        } else {
          setErrors({ general: err.response?.data?.detail || tr('Erreur Google.') })
        }
      } finally { setGLoading(false) }
    },
    onError: () => setErrors({ general: tr('Connexion Google annulée.') }),
  })

  const googleRegister = useGoogleLogin({
    onSuccess: async (tokenResp) => {
      setGLoading(true)
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResp.access_token}` },
        })
        const userInfo = await userInfoRes.json()
        setGoogleStep({ token: tokenResp.access_token, userInfo: { name: `${userInfo.given_name} ${userInfo.family_name}`, email: userInfo.email } })
      } catch {
        setErrors({ general: tr('Erreur lors de la récupération du profil Google.') })
      } finally { setGLoading(false) }
    },
    onError: () => setErrors({ general: tr('Inscription Google annulée.') }),
  })

  const onVerified = (user) => { setUser(user); goAfterAuth(navigate, user) }
  const onGoogleDone = (user) => { setUser(user); goAfterAuth(navigate, user) }

  return (
    <div className="relative min-h-dvh font-sans bg-app overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.18),transparent)]" />

      {/* ── Formulaire (colonne unique : la présentation du produit est sur la landing) ── */}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-10 sm:py-14">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <Link to="/" className="flex items-center gap-2.5" aria-label={tr('MZSolutions')}>
            <Logo className="w-12 h-auto shrink-0 text-violet-600" />
            <span className="text-xl font-bold bg-gradient-to-r from-violet-600 to-violet-400 bg-clip-text text-transparent">{tr('MZSolutions')}</span>
          </Link>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle mode={mode} onToggle={toggleTheme} />
          </div>
        </div>

        {/* Tabs — volontairement discrète (petite, fond neutre, pas d'ombre)
            pour ne PAS rivaliser avec le titre/CTA principal juste en dessous :
            le rapport DesignMeter pointait une "compétition d'attention"
            entre bascule connexion/inscription et l'action principale de la
            page, faisant hésiter les visiteurs. */}
        <div className="flex bg-app-card-alt rounded-xl p-0.5 w-fit mb-7 gap-0.5">
          {['login', 'register'].map((t) => (
            <button key={t} onClick={() => switchTab(t)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                tab === t
                  ? 'bg-app-card text-app-accent shadow-sm'
                  : 'text-app-muted-light hover:text-app-primary'
              }`}>
              {t === 'login' ? tr('Se connecter') : tr('S\'inscrire')}
            </button>
          ))}
        </div>

        {/* LOGIN */}
        {tab === 'login' && (
          <div className="flex flex-col gap-5 max-w-none">
            <div>
              <h1 className="text-3xl font-bold text-app-primary">{tr('Bon retour !')}</h1>
              <p className="text-sm text-app-muted-light mt-1.5">{tr('Connectez-vous à votre espace vendeur.')}</p>
            </div>

            <GoogleButton onClick={() => googleLogin()} loading={gLoading}>{tr('Se connecter avec Google')}</GoogleButton>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-app-card-alt" />
              <span className="text-sm text-app-muted-light font-medium">{tr('ou par email')}</span>
              <div className="flex-1 h-px bg-app-card-alt" />
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Field label={tr('Adresse email')}>
                <input type="email" placeholder={tr('votre@email.com')} className={theme.authInput}
                  value={loginForm.email} autoComplete="email"
                  onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} required />
              </Field>
              <Field label={tr('Mot de passe')}>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} placeholder={tr('Votre mot de passe')}
                    className={theme.authInput + ' pe-10'}
                    value={loginForm.password} autoComplete="current-password"
                    onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-app-muted-light hover:text-app-muted-light cursor-pointer focus-visible:outline-none">
                    {showPassword
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    }
                  </button>
                </div>
                <Link to="/forgot-password" className="text-sm font-medium text-violet-600 hover:text-app-accent hover:underline self-end mt-0.5">{tr('Mot de passe oublié ?')}</Link>
              </Field>

              {errors.general && (
                <div className="text-sm text-app-danger bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
                  {errors.general}
                  {errors.email_not_verified && (
                    <button type="button" onClick={() => setPendingEmail(errors.email)}
                      className="block mt-1 text-app-accent font-semibold underline text-xs cursor-pointer">{tr('Renvoyer le code de vérification')}</button>
                  )}
                </div>
              )}

              {pendingEmail
                ? <VerifyEmailStep email={pendingEmail} onVerified={onVerified} />
                : (
                  <button type="submit" disabled={loading} className={`w-full py-3 ${theme.btn.primary}`}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>{tr('Connexion...')}</span>
                    ) : tr('Se connecter →')}
                  </button>
                )
              }
            </form>

            <p className="text-sm text-app-muted-light text-center">{tr('Pas encore de compte ?')}{' '}<button onClick={() => switchTab('register')} className="text-app-accent font-semibold cursor-pointer hover:underline">{tr('S\'inscrire gratuitement')}</button>
            </p>
          </div>
        )}

        {/* REGISTER */}
        {tab === 'register' && (
          <div className="flex flex-col gap-5 max-w-none">
            {pendingEmail ? (
              <VerifyEmailStep email={pendingEmail} onVerified={onVerified} />
            ) : googleStep ? (
              <GoogleStoreStep googleToken={googleStep.token} userInfo={googleStep.userInfo} onDone={onGoogleDone} />
            ) : (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-app-primary">{tr('Créez votre boutique')}</h1>
                  <p className="text-sm text-app-muted-light mt-1">{tr('Essai gratuit — 50 commandes incluses.')}</p>
                </div>

                <GoogleButton onClick={() => googleRegister()} loading={gLoading}>{tr('S\'inscrire avec Google')}</GoogleButton>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-app-card-alt" />
                  <span className="text-sm text-app-muted-light font-medium">{tr('ou par email')}</span>
                  <div className="flex-1 h-px bg-app-card-alt" />
                </div>

                <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
                  <div className="flex gap-3">
                    <Field label={tr('Prénom *')} error={errors.first_name}>
                      <input type="text" placeholder={tr('Prénom')} className={theme.authInput} autoComplete="given-name"
                        value={registerForm.first_name}
                        onChange={e => setRegisterForm({ ...registerForm, first_name: e.target.value })} required />
                    </Field>
                    <Field label={tr('Nom *')} error={errors.last_name}>
                      <input type="text" placeholder={tr('Nom')} className={theme.authInput} autoComplete="family-name"
                        value={registerForm.last_name}
                        onChange={e => setRegisterForm({ ...registerForm, last_name: e.target.value })} required />
                    </Field>
                  </div>
                  <Field label={tr('Email *')} error={errors.email}>
                    <input type="email" placeholder={tr('votre@email.com')} className={theme.authInput} autoComplete="email"
                      value={registerForm.email}
                      onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })} required />
                  </Field>
                  <Field label={tr('Téléphone')} error={errors.phone}>
                    <input type="tel" placeholder={tr('+213 6xx xxx xxx')} className={theme.authInput} autoComplete="tel"
                      value={registerForm.phone}
                      onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })} />
                  </Field>
                  <Field label={tr('Nom de la boutique *')} error={errors.store_name}>
                    <input type="text" placeholder={tr('Ma Super Boutique')} className={theme.authInput}
                      value={registerForm.store_name}
                      onChange={e => setRegisterForm({ ...registerForm, store_name: e.target.value, store_slug: autoSlug(e.target.value) })} required />
                  </Field>
                  <Field label={tr('URL de la boutique *')} error={errors.store_slug}>
                    <div className="flex border border-(--border-color-hover) rounded-xl overflow-hidden focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/25 transition">
                      <span className="px-3 py-2.5 bg-violet-500/10 text-app-accent text-xs border-e border-(--border-color-hover) whitespace-nowrap flex items-center font-medium">{tr('mzsolutions.app/')}</span>
                      <input type="text" placeholder={tr('ma-boutique')}
                        className="flex-1 px-3 py-2.5 text-sm text-app-primary outline-none bg-app-card"
                        value={registerForm.store_slug}
                        onChange={e => setRegisterForm({ ...registerForm, store_slug: autoSlug(e.target.value) })} required />
                    </div>
                  </Field>
                  <Field label={tr('Mot de passe *')} error={errors.password}>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} placeholder={tr('Minimum 8 caractères')}
                        className={theme.authInput + ' pe-10'} autoComplete="new-password"
                        value={registerForm.password}
                        onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} required minLength={8} />
                      <button type="button" onClick={() => setShowPassword(p => !p)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-app-muted-light hover:text-app-muted-light cursor-pointer focus-visible:outline-none">
                        {showPassword
                          ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        }
                      </button>
                    </div>
                    {/* Aide visible en permanence (pas seulement dans le placeholder,
                        qui disparaît dès qu'on tape) — évite qu'un mot de passe rejeté
                        après soumission ressemble à un blocage inexpliqué. */}
                    <p className={`text-xs mt-1 flex items-center gap-1 ${registerForm.password.length >= 8 ? 'text-app-success' : 'text-app-muted-light'}`}>
                      {registerForm.password.length >= 8 && (
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      )}{tr('Au moins 8 caractères')}</p>
                  </Field>
                  {errors.general && (
                    <p className="text-sm text-app-danger bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{errors.general}</p>
                  )}
                  <button type="submit" disabled={loading} className={`w-full py-3 mt-1 ${theme.btn.primary}`}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>{tr('Création...')}</span>
                    ) : tr('Créer mon compte gratuitement →')}
                  </button>
                </form>

                <p className="text-sm text-app-muted-light text-center">{tr('Déjà un compte ?')}{' '}<button onClick={() => switchTab('login')} className="text-app-accent font-semibold cursor-pointer hover:underline">{tr('Se connecter')}</button>
                </p>
              </>
            )}
          </div>
        )}

        <p className="mt-6 text-xs text-app-muted-light text-center">
          <a href="/legal/terms/" target="_blank" rel="noopener noreferrer" className="hover:underline">{tr('Conditions d’utilisation')}</a>
          {' · '}
          <a href="/legal/privacy-policy/" target="_blank" rel="noopener noreferrer" className="hover:underline">{tr('Politique de confidentialité')}</a>
        </p>
      </div>


    </div>
  )
}
