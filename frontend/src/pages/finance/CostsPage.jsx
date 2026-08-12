import { useEffect, useState, useCallback } from 'react'
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

function PencilIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
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

function CostModal({ cost, onClose, onSaved }) {
  const isEdit = !!cost
  const [form, setForm]     = useState(cost ? {
    category: cost.category, label: cost.label, amount: cost.amount,
    period_start: cost.period_start, period_end: cost.period_end, note: cost.note || '',
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      if (isEdit) await api.put(`/finance/costs/${cost.id}/`, form)
      else await api.post('/finance/costs/', form)
      onSaved()
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-app-primary">{isEdit ? 'Modifier le coût' : 'Ajouter un coût'}</h3>
          <button onClick={onClose} className="text-app-muted hover:text-app-primary transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Catégorie</label>
            <Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORY_OPTIONS} variant="dark" />
          </div>
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Libellé *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required
              className={inputCls} style={bdrStyle} placeholder="Ex : Facebook Ads, Loyer local…" />
            {errors.label && <p className="text-red-400 text-xs mt-1">{errors.label}</p>}
          </div>
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Montant (DZD) *</label>
            <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
              className={inputCls} style={bdrStyle} placeholder="0" />
            {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-app-muted-light mb-1.5">Début de période *</label>
              <input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} required
                className={inputCls} style={bdrStyle} />
            </div>
            <div>
              <label className="block text-xs text-app-muted-light mb-1.5">Fin de période *</label>
              <input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} required
                className={inputCls} style={bdrStyle} />
            </div>
          </div>
          {errors.period_end && <p className="text-red-400 text-xs">{errors.period_end}</p>}
          {errors.period_start && <p className="text-red-400 text-xs">{errors.period_start}</p>}
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Note (optionnel)</label>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
              className={`${inputCls} resize-none`} style={bdrStyle} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-app-muted-light hover:text-app-primary cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {saving ? '…' : isEdit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CostsPage() {
  const [costs, setCosts]         = useState([])
  const [search, setSearch]       = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCost, setEditingCost] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')

  const fetchCosts = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (categoryFilter) params.set('category', categoryFilter)
    if (search) params.set('search', search)
    api.get(`/finance/costs/?${params}`)
      .then(({ data }) => setCosts(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [categoryFilter, search])

  useEffect(() => { fetchCosts() }, [fetchCosts])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce coût ?')) return
    await api.delete(`/finance/costs/${id}/`)
    fetchCosts()
  }

  const total = costs.reduce((s, c) => s + Number(c.amount), 0)

  return (
    <DashboardLayout title="Coûts" subtitle={`Cette page sert à enregistrer les dépenses de votre activité qui ne sont pas liées à un produit précis : loyer, salaires, publicité Facebook, abonnements... Donnez un nom libre à chaque dépense, son montant et la période qu'elle couvre (par exemple "Facebook Ads — juillet", 15 000 DA, du 1er au 31 juillet). Ces coûts ne sont pas répartis produit par produit, mais ils sont automatiquement inclus dans le calcul de votre profit net global sur la page Rentabilité.`}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {['', 'operational', 'marketing'].map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${categoryFilter === c ? 'text-white bg-violet-600' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'}`}
              style={categoryFilter === c ? undefined : { border: `1px solid ${theme.dark.border}` }}>
              {c === '' ? 'Tous' : c === 'operational' ? 'Opérationnel' : 'Marketing'}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Recherche par libellé"
            className="px-3.5 py-1.5 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          />
        </div>
        <button onClick={() => setModalOpen(true)} className={theme.btn.primary + ' text-sm shrink-0'}>
          <PlusIcon /> Ajouter un coût
        </button>
      </div>

      {modalOpen && (
        <CostModal onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchCosts() }} />
      )}
      {editingCost && (
        <CostModal cost={editingCost} onClose={() => setEditingCost(null)} onSaved={() => { setEditingCost(null); fetchCosts() }} />
      )}

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>Total affiché : <span className="text-app-primary font-medium">{money(total)}</span></p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">CATÉGORIE</th>
              <th className="px-4 py-3 font-medium">LIBELLÉ</th>
              <th className="px-4 py-3 font-medium">MONTANT</th>
              <th className="px-4 py-3 font-medium">PÉRIODE</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-app-muted">Chargement…</td></tr>
            ) : costs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-app-muted">Aucun coût saisi.</td></tr>
            ) : costs.map(c => (
              <tr key={c.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3">
                  <span className={c.category === 'marketing' ? theme.badge.info : theme.badge.neutral}>{c.category_label}</span>
                </td>
                <td className="px-4 py-3 text-app-primary">{c.label}{c.note && <><br /><span className="text-xs text-app-muted">{c.note}</span></>}</td>
                <td className="px-4 py-3 text-app-primary">{money(c.amount)}</td>
                <td className="px-4 py-3 text-app-muted-light text-xs">{c.period_start} → {c.period_end}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingCost(c)} className="p-1.5 rounded text-app-primary hover:bg-violet-500/10 transition cursor-pointer" title="Modifier"><PencilIcon /></button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Supprimer"><TrashIcon /></button>
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
