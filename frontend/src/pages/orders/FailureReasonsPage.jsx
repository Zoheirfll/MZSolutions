import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const EMPTY = { label: '', is_active: true, order: 0 }

const COMMON_REASONS = [
  'Numéro invalide', 'Injoignable après plusieurs tentatives', "Pas de réponse",
  'Client ne se souvient pas de la commande', 'Prix trop élevé', 'Délai de livraison trop long',
  'Adresse incorrecte ou incomplète', 'Commande en double', 'A commandé ailleurs',
  'Changement d\'avis', 'Produit indisponible en réalité',
]

const TABS = [
  { key: 'raisons',   label: 'Raisons' },
  { key: 'historique', label: 'Historique des échecs' },
]

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

function ArrowUpIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

function ArrowDownIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  )
}

function ReasonModal({ reason, onClose, onSaved }) {
  const [form, setForm] = useState(reason?.id ? { label: reason.label, is_active: reason.is_active, order: reason.order } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
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
          <h3 className="font-semibold text-app-primary">{reason?.id ? 'Modifier la raison' : 'Nouvelle raison d\'échec'}</h3>
          <button onClick={onClose} className="text-app-muted hover:text-app-primary transition">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Libellé *</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="ex: Numéro invalide" />
            {errors.label && <p className="text-red-400 text-xs mt-1">{errors.label}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-app-muted-light mb-1.5">Ordre d'affichage</label>
              <input type="number" min="0" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} className={inputCls} style={bdrStyle} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-violet-600 w-4 h-4" />
                <span className="text-sm text-app-primary">Active</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-app-muted-light hover:text-app-primary">Annuler</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60">
              {saving ? '…' : reason?.id ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ReasonsTab({ reasons, loading, seeding, onEdit, onDelete, onToggleActive, onSeed, onMove, onFilterHistory }) {
  return (
    <>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{reasons.length} raison{reasons.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          {reasons.length === 0 && (
            <button onClick={onSeed} disabled={seeding} className={theme.btn.secondary}>
              {seeding ? 'Ajout…' : 'Ajouter les raisons courantes'}
            </button>
          )}
          <button onClick={() => onEdit({})} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition">
            <PlusIcon />
            Ajouter une raison
          </button>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-125">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">LIBELLÉ</th>
              <th className="px-4 py-3 font-medium">ORDRE</th>
              <th className="px-4 py-3 font-medium">UTILISATIONS</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : reasons.length === 0 ? (
              <tr><td colSpan={5}>
                <div className={theme.emptyState}>
                  <svg className="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p>Aucune raison définie</p>
                </div>
              </td></tr>
            ) : reasons.map((r, i) => (
              <tr key={r.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary font-medium">{r.label}</td>
                <td className="px-4 py-3 text-app-muted-light">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 text-center">{r.order}</span>
                    <button onClick={() => onMove(i, -1)} disabled={i === 0} className="p-0.5 rounded text-app-muted hover:text-app-primary hover:bg-violet-500/5 transition disabled:opacity-20 disabled:pointer-events-none" title="Monter">
                      <ArrowUpIcon />
                    </button>
                    <button onClick={() => onMove(i, 1)} disabled={i === reasons.length - 1} className="p-0.5 rounded text-app-muted hover:text-app-primary hover:bg-violet-500/5 transition disabled:opacity-20 disabled:pointer-events-none" title="Descendre">
                      <ArrowDownIcon />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-app-muted-light">
                  {r.usage_count > 0 ? (
                    <button onClick={() => onFilterHistory(r)} className={theme.badge.info + ' cursor-pointer hover:opacity-80 transition'}>
                      {r.usage_count} fois
                    </button>
                  ) : (
                    <span style={{ color: theme.dark.muted }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => onToggleActive(r)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${r.is_active ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50' : 'text-app-muted hover:bg-violet-500/10'}`}
                    style={r.is_active ? undefined : { background: 'var(--bg-card-alt)' }}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onEdit(r)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition" title="Modifier">
                      <EditIcon />
                    </button>
                    <button onClick={() => onDelete(r.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition" title="Supprimer">
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const EMPTY_HISTORY_FILTERS = { reason: '', agent: '', date_from: '', date_to: '', search: '' }

function HistoryTab({ reasons, initialFilters }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ ...EMPTY_HISTORY_FILTERS, ...initialFilters })
  const [agents, setAgents] = useState([])
  const [data, setData] = useState({ results: [], count: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 20

  useEffect(() => {
    api.get('/team/members/?role=confirmateur').then(({ data }) => setAgents(data)).catch(() => {})
  }, [])

  const fetchHistory = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filters.reason) params.set('reason', filters.reason)
    if (filters.agent) params.set('agent', filters.agent)
    if (filters.date_from) params.set('date_from', filters.date_from)
    if (filters.date_to) params.set('date_to', filters.date_to)
    if (filters.search) params.set('search', filters.search)
    api.get(`/orders/failures/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters, page])

  useEffect(() => { fetchHistory() }, [fetchHistory])
  useEffect(() => { setPage(1) }, [filters])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const inputCls = 'px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-5">
        <input
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          placeholder="Nom ou téléphone…"
          className={inputCls} style={{ ...bdrStyle, width: 200 }}
        />
        <div style={{ width: 200 }}>
          <Select
            value={filters.reason}
            onChange={v => setFilters(f => ({ ...f, reason: v }))}
            options={[{ value: '', label: 'Toutes les raisons' }, ...reasons.map(r => ({ value: String(r.id), label: r.label }))]}
            className="px-3 py-2 rounded-lg border text-sm text-app-primary"
            style={{ background: 'transparent', borderColor: theme.dark.border }}
          />
        </div>
        <div style={{ width: 190 }}>
          <Select
            value={filters.agent}
            onChange={v => setFilters(f => ({ ...f, agent: v }))}
            options={[{ value: '', label: 'Tous les confirmateurs' }, ...agents.map(a => ({ value: String(a.id), label: `${a.first_name} ${a.last_name}` }))]}
            className="px-3 py-2 rounded-lg border text-sm text-app-primary"
            style={{ background: 'transparent', borderColor: theme.dark.border }}
          />
        </div>
        <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} className={inputCls} style={bdrStyle} />
        <span className="self-center text-app-muted text-sm">→</span>
        <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} className={inputCls} style={bdrStyle} />
        {(filters.reason || filters.agent || filters.date_from || filters.date_to || filters.search) && (
          <button onClick={() => setFilters(EMPTY_HISTORY_FILTERS)} className="text-xs px-3 py-2 text-app-muted-light hover:text-app-primary transition">
            Réinitialiser
          </button>
        )}
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{data.count} tentative{data.count !== 1 ? 's' : ''} en échec.</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">COMMANDE</th>
              <th className="px-4 py-3 font-medium">CLIENT</th>
              <th className="px-4 py-3 font-medium">RAISON</th>
              <th className="px-4 py-3 font-medium">TENTATIVE</th>
              <th className="px-4 py-3 font-medium">CONFIRMATEUR</th>
              <th className="px-4 py-3 font-medium">DATE</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={6}>
                <div className={theme.emptyState}>
                  <p>Aucun échec trouvé pour ces filtres.</p>
                </div>
              </td></tr>
            ) : data.results.map(a => (
              <tr key={a.id} onClick={() => navigate(`/dashboard/commandes/${a.order_id}`)}
                className="border-b hover:bg-violet-500/5 transition cursor-pointer" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-muted">#{a.order_id}</td>
                <td className="px-4 py-3">
                  <p className="text-app-primary font-medium">{a.client_name || 'Client'}</p>
                  <p className="text-xs font-mono" style={{ color: theme.dark.muted }}>{a.phone}</p>
                </td>
                <td className="px-4 py-3 text-app-primary">{a.reason_label || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{a.attempt_number}</td>
                <td className="px-4 py-3 text-app-muted-light">{a.agent_name || '—'}</td>
                <td className="px-4 py-3 text-app-muted text-xs">{new Date(a.attempted_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > perPage && (
        <div className="flex items-center justify-end gap-2 mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">← Précédent</button>
          <span className={theme.badge.info}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">Suivant →</button>
        </div>
      )}
    </>
  )
}

export default function FailureReasonsPage() {
  const [tab, setTab] = useState('raisons')
  const [reasons, setReasons] = useState([])
  const [modal,   setModal]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [historyFilters, setHistoryFilters] = useState({})

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

  const handleSeedCommon = async () => {
    setSeeding(true)
    try {
      const existingLabels = new Set(reasons.map(r => r.label.toLowerCase()))
      const toCreate = COMMON_REASONS.filter(label => !existingLabels.has(label.toLowerCase()))
      let order = reasons.length ? Math.max(...reasons.map(r => r.order)) + 1 : 0
      for (const label of toCreate) {
        await api.post('/orders/failure-reasons/', { label, is_active: true, order: order++ })
      }
      fetchReasons()
    } catch {} finally { setSeeding(false) }
  }

  const moveReason = async (index, direction) => {
    const other = reasons[index + direction]
    if (!other) return
    const current = reasons[index]
    await Promise.all([
      api.put(`/orders/failure-reasons/${current.id}/`, { order: other.order }),
      api.put(`/orders/failure-reasons/${other.id}/`, { order: current.order }),
    ])
    fetchReasons()
  }

  const goToHistoryForReason = (reason) => {
    setHistoryFilters({ reason: String(reason.id) })
    setTab('historique')
  }

  return (
    <DashboardLayout title="Raisons d'échec" subtitle={`Quand un confirmateur appelle un client et n'arrive pas à confirmer la commande, il doit choisir une raison ("ne répond pas", "a changé d'avis"...). L'onglet "Raisons" sert à créer et modifier la liste de ces motifs proposés à vos confirmateurs. L'onglet "Historique des échecs" vous montre chaque tentative ratée, avec des filtres par raison, par confirmateur ou par client — utile pour repérer un problème récurrent (un confirmateur qui échoue souvent, un motif très fréquent...).`}>
      {modal !== null && (
        <ReasonModal
          reason={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchReasons() }}
        />
      )}

      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'raisons' ? (
        <ReasonsTab
          reasons={reasons}
          loading={loading}
          seeding={seeding}
          onEdit={setModal}
          onDelete={handleDelete}
          onToggleActive={toggleActive}
          onSeed={handleSeedCommon}
          onMove={moveReason}
          onFilterHistory={goToHistoryForReason}
        />
      ) : (
        <HistoryTab reasons={reasons} initialFilters={historyFilters} />
      )}
    </DashboardLayout>
  )
}
