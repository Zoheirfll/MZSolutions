import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'

export default function PlatformAdminAcceptInvitation() {
  const [params] = useSearchParams()
  const navigate  = useNavigate()
  const { setUser } = useAuth()
  const token     = params.get('token') || ''

  const [info, setInfo]       = useState(null)
  const [invalid, setInvalid] = useState(false)
  const [form, setForm]       = useState({ password: '', confirm: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) { setInvalid(true); return }
    api.get(`/platform-admin/accept-invitation/?token=${token}`)
      .then(({ data }) => setInfo(data))
      .catch(() => setInvalid(true))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/platform-admin/accept-invitation/', { token, password: form.password })
      setUser(data.user)
      navigate('/platform-admin/boutiques')
    } catch (err) {
      setError(err.response?.data?.detail || 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <p className="text-gray-700 text-lg font-semibold">Lien invalide ou déjà utilisé</p>
      </div>
    )
  }

  if (!info) {
    return <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50"><p className="text-gray-500 text-sm">Vérification du lien…</p></div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-sm">
        <p className="text-2xl font-bold tracking-tight mb-2 text-gray-900">MZSolutions</p>
        <p className="text-sm text-gray-500 mb-8">Activation — équipe de confirmation superadmin</p>
        <p className="text-sm text-gray-700 mb-6">Bonjour <span className="font-semibold">{info.first_name} {info.last_name}</span>, définissez votre mot de passe.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className={theme.label}>Mot de passe *</label>
            <input type="password" required minLength={8} value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={theme.input} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={theme.label}>Confirmer le mot de passe *</label>
            <input type="password" required value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} className={theme.input} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
          <button type="submit" disabled={loading} className={`w-full py-3 text-sm ${theme.btn.primary}`}>
            {loading ? 'Activation…' : 'Activer mon compte'}
          </button>
        </form>
      </div>
    </div>
  )
}
