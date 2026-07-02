import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const EMPTY = { label: '', is_active: true, order: 0 }

function ReasonModal({ reason, onClose, onSaved }) {
  const [form, setForm] = useState(reason?.id ? { label: reason.label, is_active: reason.is_active, order: reason.order } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">{reason?.id ? 'Modifier la raison' : 'Nouvelle raison d\'échec'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Libellé *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="ex: Numéro invalide" />
            {errors.label && <p className="text-red-400 text-xs mt-1">{errors.label}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: '#7c3aed' }}>
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

      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{reasons.length} raison{reasons.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModal({})} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#7c3aed' }}>
          Ajouter une raison +
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm">
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
              <tr><td colSpan={4} className="text-center py-12 text-gray-500">Chargement…</td></tr>
            ) : reasons.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-500">Aucune raison définie.</td></tr>
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
                    <button onClick={() => setModal(r)} className="text-xs px-2.5 py-1 rounded text-violet-300 hover:bg-violet-600/20 transition">✏️</button>
                    <button onClick={() => handleDelete(r.id)} className="text-xs px-2.5 py-1 rounded text-red-400 hover:bg-red-900/20 transition">🗑️</button>
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
