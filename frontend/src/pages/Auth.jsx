import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

// ── Composants utilitaires ───────────────────────────────────────────────

function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
}

function GoogleButton({ onClick, loading, children }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-200
        rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition
        disabled:opacity-60 cursor-pointer shadow-sm">
      {!loading && (
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.8 18.9 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.4-5.1l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.4 4.3-4.4 5.7l6.2 5.2C36.9 39.1 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
        </svg>
      )}
      {loading ? 'Connexion Google...' : children}
    </button>
  )
}

// ── Étape vérification code OTP ──────────────────────────────────────────

function VerifyEmailStep({ email, onVerified }) {
  const [codes, setCodes] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()]

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...codes]
    next[i] = val
    setCodes(next)
    if (val && i < 5) refs[i + 1].current?.focus()
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !codes[i] && i > 0) refs[i - 1].current?.focus()
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setCodes(pasted.split(''))
      refs[5].current?.focus()
    }
  }

  const handleVerify = async () => {
    const code = codes.join('')
    if (code.length < 6) return
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-email/', { email, code })
      localStorage.setItem('access', data.access)
      localStorage.setItem('refresh', data.refresh)
      onVerified(data.user)
    } catch (err) {
      setError(err.response?.data?.detail || 'Code incorrect.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResent(false)
    try {
      await api.post('/auth/resend-verification/', { email })
      setResent(true)
      setCodes(['', '', '', '', '', ''])
      refs[0].current?.focus()
    } catch {}
  }

  return (
    <div className="flex flex-col items-center gap-6 max-w-sm text-center">
      <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
        <svg className="w-7 h-7 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Vérifiez votre email</h2>
        <p className="text-sm text-gray-500">
          Un code à 6 chiffres a été envoyé à<br />
          <span className="font-medium text-gray-700">{email}</span>
        </p>
      </div>

      {/* OTP inputs */}
      <div className="flex gap-2" onPaste={handlePaste}>
        {codes.map((c, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={c}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className="w-11 h-12 text-center text-xl font-semibold border border-gray-300 rounded-xl
              outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition"
          />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {resent && <p className="text-green-600 text-sm">Nouveau code envoyé !</p>}

      <button
        onClick={handleVerify}
        disabled={loading || codes.join('').length < 6}
        className={`w-full py-3 text-sm ${theme.btn.primary}`}>
        {loading ? 'Vérification...' : 'Vérifier le code'}
      </button>

      <p className="text-sm text-gray-500">
        Vous n'avez pas reçu le code ?{' '}
        <span onClick={handleResend}
          className="text-violet-600 font-medium cursor-pointer hover:underline">
          Renvoyer
        </span>
      </p>
    </div>
  )
}

// ── Formulaire boutique après Google register ────────────────────────────

function GoogleStoreStep({ googleToken, userInfo, onDone }) {
  const [storeName, setStoreName] = useState('')
  const [storeSlug, setStoreSlug] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const autoSlug = (n) => n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/google/register/', {
        access_token: googleToken,
        store_name: storeName,
        store_slug: storeSlug,
      })
      localStorage.setItem('access', data.access)
      localStorage.setItem('refresh', data.refresh)
      onDone(data.user)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création du compte.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm w-full">
      <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
        <svg className="w-5 h-5 text-violet-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <div className="text-sm">
          <p className="font-medium text-gray-800">{userInfo.name}</p>
          <p className="text-gray-500 text-xs">{userInfo.email}</p>
        </div>
      </div>

      <p className="text-sm text-gray-600">Plus qu'une étape — nommez votre boutique :</p>

      <Field label="Nom de la boutique *" error={error?.store_name}>
        <input type="text" placeholder="Ma Super Boutique" className={theme.input}
          value={storeName}
          onChange={e => { setStoreName(e.target.value); setStoreSlug(autoSlug(e.target.value)) }}
          required />
      </Field>

      <Field label="URL de la boutique *">
        <div className="flex border border-gray-300 rounded-lg overflow-hidden
          focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 transition">
          <span className="px-3 py-2.5 bg-violet-50 text-violet-400 text-xs border-r border-gray-300 whitespace-nowrap flex items-center">
            mzsolutions.app/
          </span>
          <input type="text" placeholder="ma-boutique"
            className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none bg-white"
            value={storeSlug}
            onChange={e => setStoreSlug(autoSlug(e.target.value))}
            required />
        </div>
      </Field>

      {error && typeof error === 'string' && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
      )}

      <button type="submit" disabled={loading} className={`w-full py-3 text-sm ${theme.btn.primary}`}>
        {loading ? 'Création...' : 'Créer ma boutique'}
      </button>
    </form>
  )
}

// ── Page principale Auth ─────────────────────────────────────────────────

export default function Auth() {
  const [tab, setTab] = useState('login')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)

  // Étapes post-inscription
  const [pendingEmail, setPendingEmail] = useState(null)         // → VerifyEmailStep
  const [googleStep, setGoogleStep] = useState(null)             // → GoogleStoreStep { token, userInfo }

  const { login, register, setUser } = useAuth()
  const navigate = useNavigate()

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    email: '', first_name: '', last_name: '', phone: '',
    store_name: '', store_slug: '', password: '',
  })

  const switchTab = (t) => { setTab(t); setErrors({}); setPendingEmail(null); setGoogleStep(null) }
  const autoSlug = (n) => n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  // ── Login classique
  const handleLogin = async (e) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      await login(loginForm.email, loginForm.password)
      navigate('/dashboard')
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'email_not_verified') {
        setErrors({ general: data.detail, email_not_verified: true, email: data.email })
      } else {
        setErrors({ general: data?.detail || data?.non_field_errors?.[0] || 'Identifiants invalides.' })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Inscription classique
  const handleRegister = async (e) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register/', registerForm)
      if (data.pending_verification) setPendingEmail(data.email)
    } catch (err) {
      const data = err.response?.data || {}
      const mapped = {}
      Object.entries(data).forEach(([k, v]) => { mapped[k] = Array.isArray(v) ? v[0] : v })
      setErrors(mapped)
    } finally {
      setLoading(false)
    }
  }

  // ── Google login
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResp) => {
      setGLoading(true)
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResp.access_token}` },
        })
        const userInfo = await userInfoRes.json()

        const { data } = await api.post('/auth/google/login/', { access_token: tokenResp.access_token })
        localStorage.setItem('access', data.access)
        localStorage.setItem('refresh', data.refresh)
        setUser(data.user)
        navigate('/dashboard')
      } catch (err) {
        const detail = err.response?.data?.detail
        if (err.response?.status === 404) {
          setErrors({ general: "Aucun compte associé à cet email Google. Veuillez vous inscrire d'abord." })
        } else {
          setErrors({ general: detail || 'Erreur Google.' })
        }
      } finally {
        setGLoading(false)
      }
    },
    onError: () => setErrors({ general: 'Connexion Google annulée.' }),
  })

  // ── Google register
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
      } finally {
        setGLoading(false)
      }
    },
    onError: () => setErrors({ general: 'Inscription Google annulée.' }),
  })

  const onVerified = (user) => {
    setUser(user)
    navigate('/dashboard')
  }

  const onGoogleDone = (user) => {
    setUser(user)
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen font-sans">

      {/* ─── Formulaire ─── */}
      <div className="w-full lg:w-[55%] flex flex-col px-8 py-12 sm:px-16 overflow-y-auto bg-white">

        <p className={`text-2xl font-bold tracking-tight mb-10 ${theme.logo}`}>MZSolutions</p>

        {/* Onglets */}
        <div className="flex border border-gray-200 rounded-xl w-fit mb-8 overflow-hidden shadow-sm">
          {['login', 'register'].map((t) => (
            <button key={t} onClick={() => switchTab(t)}
              className={`px-7 py-2.5 text-sm font-medium transition cursor-pointer ${
                tab === t ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-violet-50 hover:text-violet-600'
              }`}>
              {t === 'login' ? 'Se connecter' : "S'inscrire"}
            </button>
          ))}
        </div>

        {/* ── ONGLET LOGIN ── */}
        {tab === 'login' && (
          <div className="flex flex-col gap-5 max-w-sm">
            <GoogleButton onClick={() => googleLogin()} loading={gLoading}>
              Se connecter avec Google
            </GoogleButton>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">ou</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <Field label="Email *">
                <input type="email" placeholder="votre@email.com" className={theme.input}
                  value={loginForm.email}
                  onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                  required />
              </Field>
              <Field label="Mot de passe *">
                <input type="password" placeholder="Votre mot de passe" className={theme.input}
                  value={loginForm.password}
                  onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                  required />
                <Link to="/forgot-password"
                  className="text-xs text-violet-600 hover:underline self-end mt-0.5">
                  Mot de passe oublié ?
                </Link>
              </Field>

              {errors.general && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {errors.general}
                  {errors.email_not_verified && (
                    <button type="button" onClick={() => setPendingEmail(errors.email)}
                      className="block mt-1 text-violet-600 font-medium underline text-xs">
                      Renvoyer le code de vérification
                    </button>
                  )}
                </div>
              )}

              {pendingEmail && (
                <VerifyEmailStep email={pendingEmail} onVerified={onVerified} />
              )}

              {!pendingEmail && (
                <button type="submit" disabled={loading}
                  className={`w-full py-3 text-sm ${theme.btn.primary}`}>
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              )}
            </form>

            <p className="text-sm text-gray-500 text-center">
              Pas encore de compte ?{' '}
              <span onClick={() => switchTab('register')}
                className="text-violet-600 font-medium cursor-pointer hover:underline">
                S'inscrire gratuitement
              </span>
            </p>
          </div>
        )}

        {/* ── ONGLET REGISTER ── */}
        {tab === 'register' && (
          <div className="flex flex-col gap-5 max-w-sm">

            {/* Étape OTP */}
            {pendingEmail ? (
              <VerifyEmailStep email={pendingEmail} onVerified={onVerified} />
            ) : googleStep ? (
              <GoogleStoreStep
                googleToken={googleStep.token}
                userInfo={googleStep.userInfo}
                onDone={onGoogleDone}
              />
            ) : (
              <>
                <GoogleButton onClick={() => googleRegister()} loading={gLoading}>
                  S'inscrire avec Google
                </GoogleButton>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400">ou</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                <form onSubmit={handleRegister} className="flex flex-col gap-4">
                  <div className="flex gap-3">
                    <Field label="Prénom *" error={errors.first_name}>
                      <input type="text" placeholder="Votre prénom" className={theme.input}
                        value={registerForm.first_name}
                        onChange={e => setRegisterForm({ ...registerForm, first_name: e.target.value })}
                        required />
                    </Field>
                    <Field label="Nom *" error={errors.last_name}>
                      <input type="text" placeholder="Votre nom" className={theme.input}
                        value={registerForm.last_name}
                        onChange={e => setRegisterForm({ ...registerForm, last_name: e.target.value })}
                        required />
                    </Field>
                  </div>

                  <Field label="Email *" error={errors.email}>
                    <input type="email" placeholder="votre@email.com" className={theme.input}
                      value={registerForm.email}
                      onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })}
                      required />
                  </Field>

                  <Field label="Téléphone" error={errors.phone}>
                    <input type="tel" placeholder="+213 6xx xxx xxx" className={theme.input}
                      value={registerForm.phone}
                      onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })} />
                  </Field>

                  <Field label="Nom de la boutique *" error={errors.store_name}>
                    <input type="text" placeholder="Ma Super Boutique" className={theme.input}
                      value={registerForm.store_name}
                      onChange={e => setRegisterForm({
                        ...registerForm,
                        store_name: e.target.value,
                        store_slug: autoSlug(e.target.value),
                      })}
                      required />
                  </Field>

                  <Field label="URL de la boutique *" error={errors.store_slug}>
                    <div className="flex border border-gray-300 rounded-lg overflow-hidden
                      focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 transition">
                      <span className="px-3 py-2.5 bg-violet-50 text-violet-400 text-xs border-r border-gray-300 whitespace-nowrap flex items-center">
                        mzsolutions.app/
                      </span>
                      <input type="text" placeholder="ma-boutique"
                        className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none bg-white"
                        value={registerForm.store_slug}
                        onChange={e => setRegisterForm({ ...registerForm, store_slug: autoSlug(e.target.value) })}
                        required />
                    </div>
                  </Field>

                  <Field label="Mot de passe *" error={errors.password}>
                    <input type="password" placeholder="Minimum 8 caractères" className={theme.input}
                      value={registerForm.password}
                      onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                      required minLength={8} />
                  </Field>

                  {errors.general && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      {errors.general}
                    </p>
                  )}

                  <button type="submit" disabled={loading}
                    className={`w-full py-3 text-sm ${theme.btn.primary}`}>
                    {loading ? 'Création...' : 'Créer mon compte gratuitement'}
                  </button>
                </form>

                <p className="text-sm text-gray-500 text-center">
                  Déjà un compte ?{' '}
                  <span onClick={() => switchTab('login')}
                    className="text-violet-600 font-medium cursor-pointer hover:underline">
                    Se connecter
                  </span>
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Hero ─── */}
      <div className={`hidden lg:flex lg:w-[45%] ${theme.hero} items-center justify-center px-12 sticky top-0 h-screen`}>
        <div className="text-white max-w-sm">
          <span className="inline-block bg-white/10 border border-white/20 text-white/90 text-xs font-medium px-3 py-1 rounded-full mb-6">
            🇩🇿 Made in Algeria
          </span>
          <h1 className="text-[2rem] font-bold leading-snug mb-5">
            Gérez votre boutique en ligne avec MZSolutions
          </h1>
          <p className="text-white/75 text-sm leading-relaxed mb-8">
            La plateforme e-commerce conçue pour les vendeurs algériens ambitieux.
            Commandes, livraison, paiements — tout en un.
          </p>
          <ul className="space-y-3">
            {[
              'Essai gratuit — 50 commandes incluses',
              'Intégration Yalidine & ZR Express',
              'Paiement Chargily intégré',
              'Dashboard vendeur en temps réel',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-white/85 text-sm">
                <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-green-300 text-xs font-bold shrink-0">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

    </div>
  )
}
