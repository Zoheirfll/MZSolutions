import { useEffect, useState, useCallback } from 'react'
import api from '../../api/axios'
import { theme } from '../../theme'
import Toast from '../../components/Toast'

export default function PlatformAdminConfirmateursPage() {
  const [confirmateurs, setConfirmateurs] = useState([])
  const [accounts, setAccounts]           = useState([]) // boutiques actives (PlatformConfirmationAccount)
  const [assignments, setAssignments]     = useState([])
  const [loading, setLoading]             = useState(true)
  const [toast, setToast]                 = useState(null)
  const [form, setForm]                   = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [expanded, setExpanded]           = useState(null)

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
                              <button
                                key={account.id}
                                onClick={() => toggleAssignment(c, account)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ring-1 ring-inset ${
                                  on ? 'bg-violet-500/15 text-violet-300 ring-violet-500/40' : 'bg-(--bg-card) text-app-muted-light ring-(--border-color-hover)'
                                }`}
                              >
                                {account.store_name}
                              </button>
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

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
