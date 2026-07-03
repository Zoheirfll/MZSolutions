import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import Select from '../components/Select'
import api from '../api/axios'
import { theme } from '../theme'
import { WILAYAS } from '../data/wilayas'

const TABS = [
  { key: 'admin',        label: 'Administrateurs' },
  { key: 'confirmateur', label: 'Confirmateurs' },
  { key: 'dropshipper',  label: 'Dropshippers' },
  { key: 'retirer',      label: 'Retirer' },
]

const ROLE_LABELS = { admin: 'Admin', confirmateur: 'Confirmateur', dropshipper: 'Dropshipper' }

const EMPTY_FORM = {
  role: 'admin', first_name: '', last_name: '', email: '', phone: '',
  wilaya: '', commune: '', address: '',
}

function Modal({ role, onClose, onSaved }) {
  const [form, setForm]     = useState({ ...EMPTY_FORM, role })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const change = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/team/invite/', form)
      onSaved()
    } catch (err) {
      const data = err.response?.data
      setError(data?.email?.[0] || data?.detail || 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-200">
            Inviter un {ROLE_LABELS[role]}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Prénom *</label>
              <input name="first_name" value={form.first_name} onChange={change} required className={inputCls} style={bdrStyle} placeholder="Prénom" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nom *</label>
              <input name="last_name" value={form.last_name} onChange={change} required className={inputCls} style={bdrStyle} placeholder="Nom" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email *</label>
              <input type="email" name="email" value={form.email} onChange={change} required className={inputCls} style={bdrStyle} placeholder="Email" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Téléphone</label>
              <input name="phone" value={form.phone} onChange={change} className={inputCls} style={bdrStyle} placeholder="+213 …" />
            </div>
          </div>

          {role === 'admin' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Rôle</label>
              <Select
                value={form.role}
                onChange={v => setForm(f => ({ ...f, role: v }))}
                options={[{ value: 'admin', label: 'Admin' }, { value: 'confirmateur', label: 'Confirmateur' }]}
                className={inputCls}
              />
            </div>
          )}

          {role === 'dropshipper' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Wilaya</label>
                  <Select
                    value={form.wilaya}
                    onChange={v => setForm(f => ({ ...f, wilaya: v }))}
                    options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
                    placeholder="Choisissez une Wilaya"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Commune</label>
                  <input name="commune" value={form.commune} onChange={change} className={inputCls} style={bdrStyle} placeholder="Commune" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Adresse</label>
                <input name="address" value={form.address} onChange={change} className={inputCls} style={bdrStyle} placeholder="Adresse complète" />
              </div>
            </>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition">
              Annuler
            </button>
            <button type="submit" disabled={loading} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-60">
              {loading ? 'Envoi…' : 'Envoyer l\'invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MembersTable({ members, onToggle }) {
  if (!members.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500">
        <svg className="w-10 h-10 mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m9-2.13a4 4 0 10-8 0 4 4 0 008 0zm6 4v.01M3 16v.01" />
        </svg>
        <p className="text-sm">Aucun membre dans cette catégorie.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
      <table className="w-full text-sm min-w-180">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
            <th className="pb-3 pr-4 font-medium">Nom</th>
            <th className="pb-3 pr-4 font-medium">Email</th>
            <th className="pb-3 pr-4 font-medium">Téléphone</th>
            <th className="pb-3 pr-4 font-medium">Rôle</th>
            <th className="pb-3 pr-4 font-medium">Statut</th>
            <th className="pb-3 font-medium">Créé le</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.id} className="border-b" style={{ borderColor: theme.dark.border + '55' }}>
              <td className="py-3 pr-4 text-gray-200 font-medium">{m.first_name} {m.last_name}</td>
              <td className="py-3 pr-4 text-gray-400">{m.email}</td>
              <td className="py-3 pr-4 text-gray-400">{m.phone || '—'}</td>
              <td className="py-3 pr-4">
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-300">
                  {ROLE_LABELS[m.role]}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className={m.is_active ? theme.badge.success : theme.badge.warning}>
                  {m.is_active ? 'Actif' : 'En attente'}
                </span>
              </td>
              <td className="py-3 pr-4 text-gray-500 text-xs">
                {new Date(m.invited_at).toLocaleDateString('fr-FR')}
              </td>
              <td className="py-3">
                <button
                  onClick={() => onToggle(m)}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  Désactiver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function TeamPage() {
  const [activeTab, setActiveTab] = useState('admin')
  const [members, setMembers]     = useState([])
  const [showModal, setShowModal] = useState(false)
  const [invited, setInvited]     = useState(false)

  const fetchMembers = () => {
    const role = activeTab === 'retirer' ? 'confirmateur' : activeTab
    api.get(`/team/members/?role=${role}`).then(({ data }) => setMembers(data)).catch(() => {})
  }

  useEffect(() => {
    if (activeTab !== 'retirer') fetchMembers()
    else setMembers([])
  }, [activeTab])

  const handleSaved = () => {
    setShowModal(false)
    setInvited(true)
    fetchMembers()
    setTimeout(() => setInvited(false), 4000)
  }

  const handleToggle = async (m) => {
    if (!confirm(`Désactiver ${m.first_name} ${m.last_name} ?`)) return
    await api.delete(`/team/members/${m.id}/`)
    fetchMembers()
  }

  return (
    <DashboardLayout title="Équipe">
      {showModal && (
        <Modal
          role={activeTab === 'retirer' ? 'confirmateur' : activeTab}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        {/* Onglets */}
        <div className="flex gap-1 rounded-lg p-1 overflow-x-auto" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap"
              style={{
                background: activeTab === t.key ? '#7c3aed' : 'transparent',
                color: activeTab === t.key ? '#fff' : theme.dark.muted,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab !== 'retirer' && (
          <button
            onClick={() => setShowModal(true)}
            className={theme.btn.primary + ' text-sm'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ajouter
          </button>
        )}
      </div>

      {invited && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg text-sm text-emerald-400 border" style={{ background: '#0d2218', borderColor: '#16a34a44' }}>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Invitation envoyée par email.
        </div>
      )}

      <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        {activeTab === 'retirer' ? (
          <div className="text-center py-16">
            <svg className="w-10 h-10 mx-auto mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m9-8a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-400 font-medium">Relevés de paiement</p>
            <p className="text-sm mt-2" style={{ color: theme.dark.muted }}>
              Disponible au Sprint 6 — Finances & Paiements
            </p>
          </div>
        ) : (
          <MembersTable members={members} onToggle={handleToggle} />
        )}
      </div>
    </DashboardLayout>
  )
}
