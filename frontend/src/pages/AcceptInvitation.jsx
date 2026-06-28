import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { theme } from '../theme'

const ROLE_LABELS = { admin: 'Admin', confirmateur: 'Confirmateur', dropshipper: 'Dropshipper' }

export default function AcceptInvitation() {
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
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    try {
      await api.post('/team/accept-invitation/', { token, password: form.password })
      navigate('/auth?activated=1')
    } catch (err) {
      setError(err.response?.data?.detail || 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: theme.dark.app }}>
        <div className="text-center">
          <p className="text-4xl mb-4">❌</p>
          <p className="text-gray-300 text-lg font-semibold">Lien invalide ou déjà utilisé</p>
          <button onClick={() => navigate('/auth')} className="mt-4 text-violet-400 text-sm hover:underline">
            Retour à la connexion
          </button>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: theme.dark.app }}>
        <p className="text-gray-400">Vérification du lien…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: theme.dark.app }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-violet-400">MZSolutions</span>
          <p className="text-gray-400 text-sm mt-1">Activation de votre compte</p>
        </div>

        <div className="rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <div className="mb-6 pb-5 border-b" style={{ borderColor: theme.dark.border }}>
            <p className="text-gray-300 text-sm">
              Bonjour <span className="text-white font-semibold">{info.first_name} {info.last_name}</span>,
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Vous avez été invité(e) à rejoindre{' '}
              <span className="text-violet-300 font-medium">{info.store_name}</span>{' '}
              en tant que{' '}
              <span className="text-violet-300 font-medium">{ROLE_LABELS[info.role]}</span>.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Mot de passe</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition"
                style={{ borderColor: theme.dark.border }}
                placeholder="Minimum 8 caractères"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Confirmer le mot de passe</label>
              <input
                type="password"
                name="confirm"
                value={form.confirm}
                onChange={handleChange}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition"
                style={{ borderColor: theme.dark.border }}
                placeholder="Répétez le mot de passe"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition disabled:opacity-60"
              style={{ background: '#7c3aed' }}
            >
              {loading ? 'Activation…' : 'Activer mon compte'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
