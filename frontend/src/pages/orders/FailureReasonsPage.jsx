import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const EMPTY = { label: '', is_active: true, order: 0 }

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
    </svg>
  )
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function ReasonModal({ reason, onClose, onSaved }) {
  const [form, setForm] = useState(reason?.id ? { label: reason.label, is_active: reason.is_active, order: reason.order } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      if (reason?.id) await api.put(`/orders/failure-reasons/${reason.id}/`, form)
      else await api.post('/orders/failure-reasons/', form)
      onSaved()
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border p-6 max-h-[90vh] overflow-y-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">{reason?.id ? 'Modifier la raison' : 'Nouvelle raison d\'échec'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Libellé *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="ex: Numéro invalide" />
            {errors.label && <p className="text-red-400 text-xs mt-1">{errors.label}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Ordre d'affichage</label>
              <input type="number" min="0" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} className={inputCls} style={bdrStyle} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-violet-600 w-4 h-4" />
                <span className="text-sm text-gray-300">Active</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Annuler</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60">
              {saving ? '…' : reason?.id ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function FailureReasonsPage() {
  const [reasons, setReasons] = useState([])
  const [modal,   setModal]   = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchReasons = () => {
    setLoading(true)
    api.get('/orders/failure-reasons/').then(({ data }) => setReasons(data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchReasons() }, [])

  const handleDelete = async id => {
    if (!confirm('Supprimer cette raison ?')) return
    await api.delete(`/orders/failure-reasons/${id}/`)
    fetchReasons()
  }

  const toggleActive = async reason => {
    await api.put(`/orders/failure-reasons/${reason.id}/`, { is_active: !reason.is_active })
    fetchReasons()
  }

  return (
    <DashboardLayout title="Raisons d'échec">
      {modal !== null && (
        <ReasonModal
          reason={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchReasons() }}
        />
      )}

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{reasons.length} raison{reasons.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModal({})} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition">
          <PlusIcon />
          Ajouter une raison
        </button>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-125">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">LIBELLÉ</th>
              <th className="px-4 py-3 font-medium">ORDRE</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="py-16">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : reasons.length === 0 ? (
              <tr><td colSpan={4}>
                <div className={theme.emptyState}>
                  <svg className="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p>Aucune raison définie</p>
                </div>
              </td></tr>
            ) : reasons.map(r => (
              <tr key={r.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{r.label}</td>
                <td className="px-4 py-3 text-gray-400">{r.order}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(r)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${r.is_active ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(r)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition" title="Modifier">
                      <EditIcon />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition" title="Supprimer">
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
