import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const CATEGORY_OPTIONS = [
  { value: 'operational', label: 'Opérationnel' },
  { value: 'marketing',   label: 'Marketing' },
]

const EMPTY_FORM = { category: 'operational', label: '', amount: '', period_start: '', period_end: '', note: '' }

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

function CostModal({ onClose, onSaved }) {
  const [form, setForm]     = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      await api.post('/finance/costs/', form)
      onSaved()
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">Ajouter un coût</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Catégorie</label>
            <Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORY_OPTIONS} variant="dark" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Libellé *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required
              className={inputCls} style={bdrStyle} placeholder="Ex : Facebook Ads, Loyer local…" />
            {errors.label && <p className="text-red-400 text-xs mt-1">{errors.label}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Montant (DZD) *</label>
            <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
              className={inputCls} style={bdrStyle} placeholder="0" />
            {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Début de période *</label>
              <input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} required
                className={inputCls} style={bdrStyle} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Fin de période *</label>
              <input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} required
                className={inputCls} style={bdrStyle} />
            </div>
          </div>
          {errors.period_start && <p className="text-red-400 text-xs">{errors.period_start}</p>}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Note (optionnel)</label>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
              className={`${inputCls} resize-none`} style={bdrStyle} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {saving ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CostsPage() {
  const [costs, setCosts]         = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')

  const fetchCosts = () => {
    setLoading(true)
    api.get(`/finance/costs/${categoryFilter ? `?category=${categoryFilter}` : ''}`)
      .then(({ data }) => setCosts(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCosts() }, [categoryFilter])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce coût ?')) return
    await api.delete(`/finance/costs/${id}/`)
    fetchCosts()
  }

  const total = costs.reduce((s, c) => s + Number(c.amount), 0)

  return (
    <DashboardLayout title="Coûts">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          {['', 'operational', 'marketing'].map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${categoryFilter === c ? 'text-white bg-violet-600' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
              style={categoryFilter === c ? undefined : { border: `1px solid ${theme.dark.border}` }}>
              {c === '' ? 'Tous' : c === 'operational' ? 'Opérationnel' : 'Marketing'}
            </button>
          ))}
        </div>
        <button onClick={() => setModalOpen(true)} className={theme.btn.primary + ' text-sm shrink-0'}>
          <PlusIcon /> Ajouter un coût
        </button>
      </div>

      {modalOpen && (
        <CostModal onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchCosts() }} />
      )}

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>Total affiché : <span className="text-gray-200 font-medium">{money(total)}</span></p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">CATÉGORIE</th>
              <th className="px-4 py-3 font-medium">LIBELLÉ</th>
              <th className="px-4 py-3 font-medium">MONTANT</th>
              <th className="px-4 py-3 font-medium">PÉRIODE</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">Chargement…</td></tr>
            ) : costs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">Aucun coût saisi.</td></tr>
            ) : costs.map(c => (
              <tr key={c.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3">
                  <span className={c.category === 'marketing' ? theme.badge.info : theme.badge.neutral}>{c.category_label}</span>
                </td>
                <td className="px-4 py-3 text-gray-200">{c.label}{c.note && <><br /><span className="text-xs text-gray-500">{c.note}</span></>}</td>
                <td className="px-4 py-3 text-gray-200">{money(c.amount)}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{c.period_start} → {c.period_end}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Supprimer"><TrashIcon /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
