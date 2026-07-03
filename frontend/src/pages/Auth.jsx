import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="block text-sm font-medium text-gray-700 mb-0.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500 flex items-center gap-1">{error}</p>}
    </div>
  )
}

function GoogleButton({ onClick, loading, children }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200
        rounded-xl bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 text-sm font-medium
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
        <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
        </svg>
      )}
      {loading ? 'Connexion...' : children}
    </button>
  )
}

function VerifyEmailStep({ email, onVerified }) {
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
      localStorage.setItem('access', data.access)
      localStorage.setItem('refresh', data.refresh)
      onVerified(data.user)
    } catch (err) {
      setError(err.response?.data?.detail || 'Code incorrect.')
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
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 border border-violet-200 flex items-center justify-center shadow-sm">
        <svg className="w-8 h-8 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Vérifiez votre email</h2>
        <p className="text-sm text-gray-500">
          Code à 6 chiffres envoyé à<br />
          <span className="font-semibold text-violet-700">{email}</span>
        </p>
      </div>

      <div className="flex gap-2.5" onPaste={handlePaste}>
        {codes.map((c, i) => (
          <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={c}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className={`w-11 h-13 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all duration-200
              ${c ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-900'}
              focus:border-violet-500 focus:ring-2 focus:ring-violet-100`}
          />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-xl w-full">{error}</p>}
      {resent && <p className="text-emerald-600 text-sm bg-emerald-50 px-4 py-2 rounded-xl w-full">Nouveau code envoyé !</p>}

      <button onClick={handleVerify} disabled={loading || codes.join('').length < 6}
        className={`w-full py-3 ${theme.btn.primary}`}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
            Vérification...
          </span>
        ) : 'Vérifier le code'}
      </button>

      <p className="text-sm text-gray-500">
        Pas reçu le code ?{' '}
        <button onClick={handleResend} className="text-violet-600 font-semibold hover:underline cursor-pointer">
          Renvoyer
        </button>
      </p>
    </div>
  )
}

function GoogleStoreStep({ googleToken, userInfo, onDone }) {
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
      localStorage.setItem('access', data.access); localStorage.setItem('refresh', data.refresh)
      onDone(data.user)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création du compte.')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm w-full">
      <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
          {userInfo.name[0]}
        </div>
        <div className="text-sm min-w-0">
          <p className="font-semibold text-gray-800 truncate">{userInfo.name}</p>
          <p className="text-gray-500 text-xs truncate">{userInfo.email}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 font-medium">Plus qu'une étape — nommez votre boutique :</p>
      <Field label="Nom de la boutique *">
        <input type="text" placeholder="Ma Super Boutique" className={theme.input}
          value={storeName} onChange={e => { setStoreName(e.target.value); setStoreSlug(autoSlug(e.target.value)) }} required />
      </Field>
      <Field label="URL de la boutique *">
        <div className="flex border border-gray-300 rounded-xl overflow-hidden focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 transition">
          <span className="px-3 py-2.5 bg-violet-50 text-violet-500 text-xs border-r border-gray-300 whitespace-nowrap flex items-center font-medium">
            mzsolutions.app/
          </span>
          <input type="text" placeholder="ma-boutique"
            className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none bg-white"
            value={storeSlug} onChange={e => setStoreSlug(autoSlug(e.target.value))} required />
        </div>
      </Field>
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>}
      <button type="submit" disabled={loading} className={`w-full py-3 ${theme.btn.primary}`}>
        {loading ? 'Création...' : 'Créer ma boutique'}
      </button>
    </form>
  )
}

export default function Auth() {
  const [tab, setTab] = useState('login')
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
      await login(loginForm.email, loginForm.password); navigate('/dashboard')
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'email_not_verified') {
        setErrors({ general: data.detail, email_not_verified: true, email: data.email })
      } else {
        setErrors({ general: data?.detail || data?.non_field_errors?.[0] || 'Identifiants invalides.' })
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
        localStorage.setItem('access', data.access); localStorage.setItem('refresh', data.refresh)
        setUser(data.user); navigate('/dashboard')
      } catch (err) {
        if (err.response?.status === 404) {
          setErrors({ general: "Aucun compte Google associé. Veuillez vous inscrire d'abord." })
        } else {
          setErrors({ general: err.response?.data?.detail || 'Erreur Google.' })
        }
      } finally { setGLoading(false) }
    },
    onError: () => setErrors({ general: 'Connexion Google annulée.' }),
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
        setErrors({ general: 'Erreur lors de la récupération du profil Google.' })
      } finally { setGLoading(false) }
    },
    onError: () => setErrors({ general: 'Inscription Google annulée.' }),
  })

  const onVerified = (user) => { setUser(user); navigate('/dashboard') }
  const onGoogleDone = (user) => { setUser(user); navigate('/dashboard') }

  return (
    <div className="flex min-h-dvh font-sans">

      {/* ── Formulaire ── */}
      <div className="w-full lg:w-[55%] flex flex-col px-6 py-10 sm:px-14 sm:py-14 overflow-y-auto bg-white">

        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}>
            <span className="text-white text-xs font-bold">MZ</span>
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-violet-700 to-violet-500 bg-clip-text text-transparent">
            MZSolutions
          </span>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-2xl p-1 w-fit mb-8 gap-1">
          {['login', 'register'].map((t) => (
            <button key={t} onClick={() => switchTab(t)}
              className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                tab === t
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'login' ? 'Se connecter' : "S'inscrire"}
            </button>
          ))}
        </div>

        {/* LOGIN */}
        {tab === 'login' && (
          <div className="flex flex-col gap-5 max-w-sm">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bon retour !</h1>
              <p className="text-sm text-gray-500 mt-1">Connectez-vous à votre espace vendeur.</p>
            </div>

            <GoogleButton onClick={() => googleLogin()} loading={gLoading}>
              Se connecter avec Google
            </GoogleButton>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400 font-medium">ou par email</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Field label="Adresse email">
                <input type="email" placeholder="votre@email.com" className={theme.input}
                  value={loginForm.email} autoComplete="email"
                  onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} required />
              </Field>
              <Field label="Mot de passe">
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Votre mot de passe"
                    className={theme.input + ' pr-10'}
                    value={loginForm.password} autoComplete="current-password"
                    onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer focus-visible:outline-none">
                    {showPassword
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    }
                  </button>
                </div>
                <Link to="/forgot-password" className="text-xs text-violet-600 hover:underline self-end mt-0.5">
                  Mot de passe oublié ?
                </Link>
              </Field>

              {errors.general && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  {errors.general}
                  {errors.email_not_verified && (
                    <button type="button" onClick={() => setPendingEmail(errors.email)}
                      className="block mt-1 text-violet-600 font-semibold underline text-xs cursor-pointer">
                      Renvoyer le code de vérification
                    </button>
                  )}
                </div>
              )}

              {pendingEmail
                ? <VerifyEmailStep email={pendingEmail} onVerified={onVerified} />
                : (
                  <button type="submit" disabled={loading} className={`w-full py-3 ${theme.btn.primary}`}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                        Connexion...
                      </span>
                    ) : 'Se connecter →'}
                  </button>
                )
              }
            </form>

            <p className="text-sm text-gray-500 text-center">
              Pas encore de compte ?{' '}
              <button onClick={() => switchTab('register')} className="text-violet-600 font-semibold cursor-pointer hover:underline">
                S'inscrire gratuitement
              </button>
            </p>
          </div>
        )}

        {/* REGISTER */}
        {tab === 'register' && (
          <div className="flex flex-col gap-5 max-w-sm">
            {pendingEmail ? (
              <VerifyEmailStep email={pendingEmail} onVerified={onVerified} />
            ) : googleStep ? (
              <GoogleStoreStep googleToken={googleStep.token} userInfo={googleStep.userInfo} onDone={onGoogleDone} />
            ) : (
              <>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Créez votre boutique</h1>
                  <p className="text-sm text-gray-500 mt-1">Essai gratuit — 50 commandes incluses.</p>
                </div>

                <GoogleButton onClick={() => googleRegister()} loading={gLoading}>
                  S'inscrire avec Google
                </GoogleButton>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 font-medium">ou par email</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
                  <div className="flex gap-3">
                    <Field label="Prénom *" error={errors.first_name}>
                      <input type="text" placeholder="Prénom" className={theme.input} autoComplete="given-name"
                        value={registerForm.first_name}
                        onChange={e => setRegisterForm({ ...registerForm, first_name: e.target.value })} required />
                    </Field>
                    <Field label="Nom *" error={errors.last_name}>
                      <input type="text" placeholder="Nom" className={theme.input} autoComplete="family-name"
                        value={registerForm.last_name}
                        onChange={e => setRegisterForm({ ...registerForm, last_name: e.target.value })} required />
                    </Field>
                  </div>
                  <Field label="Email *" error={errors.email}>
                    <input type="email" placeholder="votre@email.com" className={theme.input} autoComplete="email"
                      value={registerForm.email}
                      onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })} required />
                  </Field>
                  <Field label="Téléphone" error={errors.phone}>
                    <input type="tel" placeholder="+213 6xx xxx xxx" className={theme.input} autoComplete="tel"
                      value={registerForm.phone}
                      onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })} />
                  </Field>
                  <Field label="Nom de la boutique *" error={errors.store_name}>
                    <input type="text" placeholder="Ma Super Boutique" className={theme.input}
                      value={registerForm.store_name}
                      onChange={e => setRegisterForm({ ...registerForm, store_name: e.target.value, store_slug: autoSlug(e.target.value) })} required />
                  </Field>
                  <Field label="URL de la boutique *" error={errors.store_slug}>
                    <div className="flex border border-gray-300 rounded-xl overflow-hidden focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 transition">
                      <span className="px-3 py-2.5 bg-violet-50 text-violet-500 text-xs border-r border-gray-200 whitespace-nowrap flex items-center font-medium">
                        mzsolutions.app/
                      </span>
                      <input type="text" placeholder="ma-boutique"
                        className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none bg-white"
                        value={registerForm.store_slug}
                        onChange={e => setRegisterForm({ ...registerForm, store_slug: autoSlug(e.target.value) })} required />
                    </div>
                  </Field>
                  <Field label="Mot de passe *" error={errors.password}>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} placeholder="Minimum 8 caractères"
                        className={theme.input + ' pr-10'} autoComplete="new-password"
                        value={registerForm.password}
                        onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} required minLength={8} />
                      <button type="button" onClick={() => setShowPassword(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer focus-visible:outline-none">
                        {showPassword
                          ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        }
                      </button>
                    </div>
                  </Field>
                  {errors.general && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{errors.general}</p>
                  )}
                  <button type="submit" disabled={loading} className={`w-full py-3 mt-1 ${theme.btn.primary}`}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                        Création...
                      </span>
                    ) : 'Créer mon compte gratuitement →'}
                  </button>
                </form>

                <p className="text-sm text-gray-500 text-center">
                  Déjà un compte ?{' '}
                  <button onClick={() => switchTab('login')} className="text-violet-600 font-semibold cursor-pointer hover:underline">
                    Se connecter
                  </button>
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Hero panel ── */}
      <div className={`hidden lg:flex lg:w-[45%] relative overflow-hidden items-center justify-center px-12 sticky top-0 h-dvh`}
        style={{ background: 'linear-gradient(145deg, #1a0533 0%, #2e1065 40%, #4c1d95 70%, #6d28d9 100%)' }}>

        {/* Decorative circles */}
        <div className="absolute top-[-80px] right-[-80px] w-72 h-72 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />
        <div className="absolute bottom-[-60px] left-[-60px] w-64 h-64 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #c4b5fd, transparent)' }} />

        <div className="relative text-white max-w-sm z-10">
          <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white/90 text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Made in Algeria
          </span>
          <h1 className="text-[2.1rem] font-bold leading-tight mb-4">
            Gérez votre boutique en ligne avec <span className="text-violet-300">MZSolutions</span>
          </h1>
          <p className="text-white/65 text-sm leading-relaxed mb-8">
            La plateforme e-commerce conçue pour les vendeurs algériens. Commandes, livraison, paiements — tout en un.
          </p>
          <ul className="space-y-3.5">
            {[
              'Essai gratuit — 50 commandes incluses',
              'Intégration Yalidine & ZR Express',
              'Paiement Chargily intégré',
              'Dashboard vendeur en temps réel',
            ].map((f) => (
              <li key={f} className="flex items-center gap-3 text-white/80 text-sm">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {f}
              </li>
            ))}
          </ul>

          {/* Social proof */}
          <div className="mt-10 pt-8 border-t border-white/10 flex items-center gap-4">
            <div className="flex -space-x-2">
              {['#7c3aed','#6d28d9','#8b5cf6'].map((c, i) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-white/20 flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: c }}>
                  {['A','B','C'][i]}
                </div>
              ))}
            </div>
            <p className="text-xs text-white/60">
              Rejoignez des <span className="text-white/90 font-semibold">centaines de vendeurs</span> algériens
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}
