import { useEffect, useState, useCallback } from 'react'
import api from '../../api/axios'
import { theme } from '../../theme'
import Toast from '../../components/Toast'

function AssignmentPermissionsModal({ assignment, onClose }) {
  const [catalog, setCatalog] = useState(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    api.get(`/platform-admin/assignments/${assignment.id}/permissions/`)
      .then(({ data }) => setCatalog(data.catalog))
      .catch(() => setError('Erreur de chargement des permissions.'))
  }, [assignment.id])

  const toggle = async (key, enabled) => {
    setCatalog(prev => prev.map(p => p.key === key ? { ...p, enabled, is_custom: true } : p))
    try {
      await api.post(`/platform-admin/assignments/${assignment.id}/permissions/`, { permission: key, enabled })
    } catch {
      setError("Échec de la mise à jour — rechargez la page.")
    }
  }

  const grouped = {}
  ;(catalog || []).forEach(p => {
    const cat = p.category || 'Autres'
    grouped[cat] = grouped[cat] || []
    grouped[cat].push(p)
  })

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border p-5 flex flex-col gap-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-app-primary">Permissions — {assignment.confirmateur_name}</h2>
            <p className="text-xs text-app-muted mt-0.5">Sur la boutique {assignment.store_name} uniquement. Tout est désactivé par défaut.</p>
          </div>
          <button onClick={onClose} className="text-app-muted-light hover:text-app-primary text-xl leading-none cursor-pointer">×</button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {!catalog && !error && <p className="text-xs text-app-muted">Chargement…</p>}

        {catalog && Object.entries(grouped).map(([cat, perms]) => (
          <div key={cat} className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted-light">{cat}</p>
            <div className="flex flex-col gap-1.5">
              {perms.map(p => (
                <label key={p.key} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg hover:bg-violet-500/5 cursor-pointer">
                  <span className="text-sm text-app-primary flex items-center gap-2">
                    {p.label}
                    {p.is_custom && <span className={theme.badge.info}>personnalisé</span>}
                  </span>
                  <input type="checkbox" checked={p.enabled} onChange={e => toggle(p.key, e.target.checked)} className="accent-violet-600 w-4 h-4 cursor-pointer shrink-0" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PlatformAdminConfirmateursPage() {
  const [confirmateurs, setConfirmateurs] = useState([])
  const [accounts, setAccounts]           = useState([]) // boutiques actives (PlatformConfirmationAccount)
  const [assignments, setAssignments]     = useState([])
  const [loading, setLoading]             = useState(true)
  const [toast, setToast]                 = useState(null)
  const [form, setForm]                   = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [expanded, setExpanded]           = useState(null)
  const [permAssignment, setPermAssignment] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: confirmateurList }, { data: storesList }, { data: assignmentList }] = await Promise.all([
        api.get('/platform-admin/confirmateurs/'),
        api.get('/platform-admin/stores/', { params: { active_only: 1, per_page: 100 } }),
        api.get('/platform-admin/assignments/'),
      ])
      setConfirmateurs(confirmateurList)
      setAccounts(storesList.results.filter(s => s.confirmation).map(s => s.confirmation))
      setAssignments(assignmentList)
    } catch {
      setToast({ type: 'error', message: 'Erreur de chargement.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleInvite = async (e) => {
    e.preventDefault()
    try {
      await api.post('/platform-admin/confirmateurs/', form)
      setForm({ first_name: '', last_name: '', email: '', phone: '' })
      setToast({ type: 'success', message: 'Invitation envoyée.' })
      load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.email?.[0] || err.response?.data?.detail || "Échec de l'invitation." })
    }
  }

  const toggleConfirmateurActive = async (c) => {
    try {
      await api.put(`/platform-admin/confirmateurs/${c.id}/`, { is_active: !c.is_active })
      load()
    } catch {
      setToast({ type: 'error', message: 'Échec de la mise à jour.' })
    }
  }

  const resendInvite = async (c) => {
    try {
      await api.post(`/platform-admin/confirmateurs/${c.id}/resend-invite/`)
      setToast({ type: 'success', message: 'Invitation renvoyée.' })
      load()
    } catch {
      setToast({ type: 'error', message: "Échec de l'envoi." })
    }
  }

  const assignmentFor = (confirmateurId, accountId) =>
    assignments.find(a => a.confirmateur === confirmateurId && a.account === accountId)

  const toggleAssignment = async (confirmateur, account) => {
    const existing = assignmentFor(confirmateur.id, account.id)
    try {
      if (existing) {
        await api.put(`/platform-admin/assignments/${existing.id}/`, { is_active: !existing.is_active })
      } else {
        await api.post('/platform-admin/assignments/', { confirmateur: confirmateur.id, account: account.id })
      }
      const { data } = await api.get('/platform-admin/assignments/')
      setAssignments(data)
    } catch {
      setToast({ type: 'error', message: "Échec de l'assignation." })
    }
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-app-primary">Confirmateurs</h1>
        <p className="text-sm text-app-muted mt-1">
          Équipe de confirmation du superadmin — assignée boutique par boutique (uniquement les boutiques ayant activé le service).
        </p>
      </div>

      <form onSubmit={handleInvite} className="rounded-xl border p-5 flex flex-wrap items-end gap-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
        <div className="flex flex-col gap-1">
          <label className={theme.labelDark}>Prénom</label>
          <input required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className={theme.inputDark + ' w-40'} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={theme.labelDark}>Nom</label>
          <input required value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className={theme.inputDark + ' w-40'} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={theme.labelDark}>Email</label>
          <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={theme.inputDark + ' w-64'} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={theme.labelDark}>Téléphone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={theme.inputDark + ' w-40'} />
        </div>
        <button type="submit" className={theme.btn.primary}>Inviter</button>
      </form>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Compte</th>
              <th className="px-4 py-3">Actif</th>
              <th className="px-4 py-3">Boutiques assignées</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-app-muted">Chargement…</td></tr>}
            {!loading && confirmateurs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-app-muted">Aucun confirmateur.</td></tr>}
            {!loading && confirmateurs.map(c => (
              <>
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                  <td className="px-4 py-3 text-app-primary font-medium">{c.first_name} {c.last_name}</td>
                  <td className="px-4 py-3 text-app-muted">{c.email}</td>
                  <td className="px-4 py-3 text-app-muted">
                    {c.is_activated ? 'Activé' : (
                      <button onClick={() => resendInvite(c)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">
                        {c.invite_expired ? 'Invitation expirée — renvoyer' : 'En attente — renvoyer'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleConfirmateurActive(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        c.is_active ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30' : 'bg-(--bg-card-alt) text-app-muted-light ring-1 ring-inset ring-(--border-color-hover)'
                      }`}
                    >
                      {c.is_active ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">
                      {expanded === c.id ? 'Masquer' : `Gérer (${assignments.filter(a => a.confirmateur === c.id && a.is_active).length})`}
                    </button>
                  </td>
                </tr>
                {expanded === c.id && (
                  <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <td colSpan={5} className="px-4 py-4" style={{ background: 'var(--bg-card-alt)' }}>
                      {accounts.length === 0 ? (
                        <p className="text-xs text-app-muted">Aucune boutique n'a encore activé le service de confirmation.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {accounts.map(account => {
                            const a = assignmentFor(c.id, account.id)
                            const on = !!a?.is_active
                            return (
                              <div key={account.id} className="flex items-center gap-1">
                                <button
                                  onClick={() => toggleAssignment(c, account)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ring-1 ring-inset ${
                                    on ? 'bg-violet-500/15 text-violet-300 ring-violet-500/40' : 'bg-(--bg-card) text-app-muted-light ring-(--border-color-hover)'
                                  }`}
                                >
                                  {account.store_name}
                                </button>
                                {on && a && (
                                  <button onClick={() => setPermAssignment(a)} title="Gérer les permissions"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-app-muted-light hover:text-violet-300 hover:bg-violet-500/10 transition cursor-pointer">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                                      <circle cx="12" cy="12" r="3" />
                                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {permAssignment && (
        <AssignmentPermissionsModal assignment={permAssignment} onClose={() => setPermAssignment(null)} />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
