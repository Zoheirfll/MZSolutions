import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme'

function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
}

export default function Auth() {
  const [tab, setTab] = useState('login')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    email: '', first_name: '', last_name: '', phone: '',
    store_name: '', store_slug: '', password: '',
  })

  const switchTab = (t) => { setTab(t); setErrors({}) }

  const handleLogin = async (e) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      await login(loginForm.email, loginForm.password)
      navigate('/dashboard')
    } catch (err) {
      const data = err.response?.data
      setErrors({ general: data?.non_field_errors?.[0] ?? 'Email ou mot de passe incorrect.' })
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      await register(registerForm)
      navigate('/dashboard')
    } catch (err) {
      const data = err.response?.data || {}
      const mapped = {}
      Object.entries(data).forEach(([k, v]) => { mapped[k] = Array.isArray(v) ? v[0] : v })
      setErrors(mapped)
    } finally {
      setLoading(false)
    }
  }

  const autoSlug = (name) =>
    name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  return (
    <div className="flex min-h-screen font-sans">

      {/* ─── Formulaire (gauche) ─── */}
      <div className="w-full lg:w-[55%] flex flex-col px-8 py-12 sm:px-16 overflow-y-auto bg-white">

        {/* Logo */}
        <p className={`text-2xl font-bold tracking-tight mb-10 ${theme.logo}`}>MZSolutions</p>

        {/* Onglets */}
        <div className="flex border border-gray-200 rounded-xl w-fit mb-8 overflow-hidden shadow-sm">
          {['login', 'register'].map((t) => (
            <button key={t} onClick={() => switchTab(t)}
              className={`px-7 py-2.5 text-sm font-medium transition cursor-pointer ${
                tab === t
                  ? 'bg-violet-600 text-white shadow-inner'
                  : 'bg-white text-gray-500 hover:bg-violet-50 hover:text-violet-600'
              }`}>
              {t === 'login' ? 'Se connecter' : "S'inscrire"}
            </button>
          ))}
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-5 max-w-sm">
            <Field label="Email *" error={errors.email}>
              <input type="email" placeholder="votre@email.com" className={theme.input}
                value={loginForm.email}
                onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                required />
            </Field>

            <Field label="Mot de passe *" error={errors.password}>
              <input type="password" placeholder="Votre mot de passe" className={theme.input}
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                required />
            </Field>

            {errors.general && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {errors.general}
              </div>
            )}

            <button type="submit" disabled={loading}
              className={`w-full py-3 text-sm mt-1 ${theme.btn.primary}`}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>

            <p className="text-sm text-gray-500 text-center">
              Pas encore de compte ?{' '}
              <span onClick={() => switchTab('register')}
                className="text-violet-600 font-medium cursor-pointer hover:underline">
                S'inscrire gratuitement
              </span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="flex flex-col gap-4 max-w-sm">
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
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {errors.general}
              </div>
            )}

            <button type="submit" disabled={loading}
              className={`w-full py-3 text-sm mt-1 ${theme.btn.primary}`}>
              {loading ? 'Création...' : 'Créer mon compte gratuitement'}
            </button>

            <p className="text-sm text-gray-500 text-center">
              Déjà un compte ?{' '}
              <span onClick={() => switchTab('login')}
                className="text-violet-600 font-medium cursor-pointer hover:underline">
                Se connecter
              </span>
            </p>
          </form>
        )}
      </div>

      {/* ─── Hero panneau (droite) ─── */}
      <div className={`hidden lg:flex lg:w-[45%] ${theme.hero} items-center justify-center px-12 sticky top-0 h-screen`}>
        <div className="text-white max-w-sm">
          {/* Badge */}
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
                <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-green-300 text-xs font-bold shrink-0">
                  ✓
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
