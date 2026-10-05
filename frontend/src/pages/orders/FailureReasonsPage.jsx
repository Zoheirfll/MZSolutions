import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'
import TrackingBadge from '../../components/TrackingBadge'
import { tt } from '../../i18n'
import { useTranslation } from 'react-i18next'
import { sfx } from '../../i18n'

const EMPTY = { label: '', is_active: true, order: 0 }

const COMMON_REASONS = [
  tt('Numéro invalide'), tt('Injoignable après plusieurs tentatives'), tt('Pas de réponse'),
  tt('Client ne se souvient pas de la commande'), tt('Prix trop élevé'), tt('Délai de livraison trop long'),
  tt('Adresse incorrecte ou incomplète'), tt('Commande en double'), tt('A commandé ailleurs'),
  tt('Changement d\'avis'), tt('Produit indisponible en réalité'),
]

const TABS = [
  { key: 'raisons',   label: tt('Raisons') },
  { key: 'historique', label: tt('Historique des échecs') },
  { key: 'suivi_transporteur', label: tt('Suivi transporteur') },
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
  const { t: tr } = useTranslation('dashboard')
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
          <h3 className="font-semibold text-app-primary">{reason?.id ? tr('Modifier la raison') : tr('Nouvelle raison d\'échec')}</h3>
          <button onClick={onClose} className="text-app-muted hover:text-app-primary transition">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">{tr('Libellé *')}</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder={tr('ex: Numéro invalide')} />
            {errors.label && <p className="text-red-400 text-xs mt-1">{errors.label}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-app-muted-light mb-1.5">{tr('Ordre d\'affichage')}</label>
              <input type="number" min="0" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} className={inputCls} style={bdrStyle} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-violet-600 w-4 h-4" />
                <span className="text-sm text-app-primary">{tr('Active')}</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-app-muted-light hover:text-app-primary">{tr('Annuler')}</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60">
              {saving ? '…' : reason?.id ? tr('Mettre à jour') : tr('Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ReasonsTab({ reasons, loading, seeding, onEdit, onDelete, onToggleActive, onSeed, onMove, onFilterHistory }) {
  const { t: tr } = useTranslation('dashboard')
  return (
    <>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{tr('{{length}} raison', { length: reasons.length })}{reasons.length !== 1 ? sfx('s') : ''}</p>
        <div className="flex items-center gap-2">
          {reasons.length === 0 && (
            <button onClick={onSeed} disabled={seeding} className={theme.btn.secondary}>
              {seeding ? tr('Ajout…') : tr('Ajouter les raisons courantes')}
            </button>
          )}
          <button onClick={() => onEdit({})} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition">
            <PlusIcon />{tr('Ajouter une raison')}</button>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-125">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-start text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">{tr('LIBELLÉ')}</th>
              <th className="px-4 py-3 font-medium">{tr('ORDRE')}</th>
              <th className="px-4 py-3 font-medium">{tr('UTILISATIONS')}</th>
              <th className="px-4 py-3 font-medium">{tr('STATUT')}</th>
              <th className="px-4 py-3 font-medium">{tr('ACTIONS')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>{tr('Chargement…')}</div>
              </td></tr>
            ) : reasons.length === 0 ? (
              <tr><td colSpan={5}>
                <div className={theme.emptyState}>
                  <svg className="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p>{tr('Aucune raison définie')}</p>
                </div>
              </td></tr>
            ) : reasons.map((r, i) => (
              <tr key={r.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary font-medium">{r.label}</td>
                <td className="px-4 py-3 text-app-muted-light">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 text-center">{r.order}</span>
                    <button onClick={() => onMove(i, -1)} disabled={i === 0} className="p-0.5 rounded text-app-muted hover:text-app-primary hover:bg-violet-500/5 transition disabled:opacity-20 disabled:pointer-events-none" title={tr('Monter')}>
                      <ArrowUpIcon />
                    </button>
                    <button onClick={() => onMove(i, 1)} disabled={i === reasons.length - 1} className="p-0.5 rounded text-app-muted hover:text-app-primary hover:bg-violet-500/5 transition disabled:opacity-20 disabled:pointer-events-none" title={tr('Descendre')}>
                      <ArrowDownIcon />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-app-muted-light">
                  {r.usage_count > 0 ? (
                    <button onClick={() => onFilterHistory(r)} className={theme.badge.info + ' cursor-pointer hover:opacity-80 transition'}>{tr('{{usage_count}} fois', { usage_count: r.usage_count })}</button>
                  ) : (
                    <span style={{ color: theme.dark.muted }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => onToggleActive(r)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${r.is_active ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50' : 'text-app-muted hover:bg-violet-500/10'}`}
                    style={r.is_active ? undefined : { background: 'var(--bg-card-alt)' }}>
                    {r.is_active ? tr('Active') : tr('Inactive')}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onEdit(r)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition" title={tr('Modifier')}>
                      <EditIcon />
                    </button>
                    <button onClick={() => onDelete(r.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition" title={tr('Supprimer')}>
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
  const { t: tr } = useTranslation('dashboard')
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
          placeholder={tr('Nom ou téléphone…')}
          className={inputCls} style={{ ...bdrStyle, width: 200 }}
        />
        <div style={{ width: 200 }}>
          <Select
            value={filters.reason}
            onChange={v => setFilters(f => ({ ...f, reason: v }))}
            options={[{ value: '', label: tr('Toutes les raisons') }, ...reasons.map(r => ({ value: String(r.id), label: r.label }))]}
            className="px-3 py-2 rounded-lg border text-sm text-app-primary"
            style={{ background: 'transparent', borderColor: theme.dark.border }}
          />
        </div>
        <div style={{ width: 190 }}>
          <Select
            value={filters.agent}
            onChange={v => setFilters(f => ({ ...f, agent: v }))}
            options={[{ value: '', label: tr('Tous les confirmateurs') }, ...agents.map(a => ({ value: String(a.id), label: `${a.first_name} ${a.last_name}` }))]}
            className="px-3 py-2 rounded-lg border text-sm text-app-primary"
            style={{ background: 'transparent', borderColor: theme.dark.border }}
          />
        </div>
        <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} className={inputCls} style={bdrStyle} />
        <span className="self-center text-app-muted text-sm">→</span>
        <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} className={inputCls} style={bdrStyle} />
        {(filters.reason || filters.agent || filters.date_from || filters.date_to || filters.search) && (
          <button onClick={() => setFilters(EMPTY_HISTORY_FILTERS)} className="text-xs px-3 py-2 text-app-muted-light hover:text-app-primary transition">{tr('Réinitialiser')}</button>
        )}
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{tr('{{count}} tentative', { count: data.count })}{data.count !== 1 ? sfx('s') : ''}{' '}{tr('en échec.')}</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-start text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">{tr('COMMANDE')}</th>
              <th className="px-4 py-3 font-medium">{tr('CLIENT')}</th>
              <th className="px-4 py-3 font-medium">{tr('RAISON')}</th>
              <th className="px-4 py-3 font-medium">{tr('TENTATIVE')}</th>
              <th className="px-4 py-3 font-medium">{tr('CONFIRMATEUR')}</th>
              <th className="px-4 py-3 font-medium">{tr('SUIVI')}</th>
              <th className="px-4 py-3 font-medium">{tr('DATE')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>{tr('Chargement…')}</div>
              </td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={7}>
                <div className={theme.emptyState}>
                  <p>{tr('Aucun échec trouvé pour ces filtres.')}</p>
                </div>
              </td></tr>
            ) : data.results.map(a => (
              <tr key={a.id} onClick={() => navigate(`/dashboard/commandes/${a.order_id}`)}
                className="border-b hover:bg-violet-500/5 transition cursor-pointer" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-muted">#{a.order_id}</td>
                <td className="px-4 py-3">
                  <p className="text-app-primary font-medium">{a.client_name || tr('Client')}</p>
                  <p className="text-xs font-mono" style={{ color: theme.dark.muted }}>{a.phone}</p>
                </td>
                <td className="px-4 py-3 text-app-primary">{a.reason_label || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{a.attempt_number}</td>
                <td className="px-4 py-3 text-app-muted-light">{a.agent_name || '—'}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <TrackingBadge trackingNumber={a.carrier_tracking_number} carrierLabel={a.carrier_label} />
                </td>
                <td className="px-4 py-3 text-app-muted text-xs">{new Date(a.attempted_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > perPage && (
        <div className="flex items-center justify-end gap-2 mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">{tr('← Précédent')}</button>
          <span className={theme.badge.info}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">{tr('Suivant →')}</button>
        </div>
      )}
    </>
  )
}

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 2v6h-6M3 22v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0020.49 15" />
    </svg>
  )
}

function DownloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

function exportCsv(rows) {
  const header = ['ID', 'Nom', tt('Téléphone'), 'Wilaya', 'Commune', tt('Prix total'), 'Suivi', 'Sous-statut', 'Remarque']
  const lines = rows.map(o => [
    o.id, `${o.first_name} ${o.last_name}`.trim(), o.phone, o.wilaya, o.commune,
    o.total, o.carrier_tracking_number || '', o.carrier_status || '', (o.note || '').replace(/\n/g, ' '),
  ])
  const csv = [header, ...lines].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'suivi-transporteur.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const SUBSTATUS_OPTIONS = [
  { value: '',                    label: '—' },
  { value: 'pending_processing',  label: tt('En attente de traitement') },
  { value: 'accepted',            label: tt('Accepté') },
  { value: 'cancelled',           label: tt('Annulé') },
  { value: 'unreachable',         label: tt('Injoignable') },
]

function CarrierTrackingTab() {
  const { t: tr } = useTranslation('dashboard')
  const navigate = useNavigate()
  const [data, setData] = useState({ results: [], count: 0, buckets: [] })
  const [search, setSearch] = useState('')
  const [bucket, setBucket] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const perPage = 20

  const updateSubstatus = async (order, value) => {
    setSavingId(order.id)
    setData(prev => ({ ...prev, results: prev.results.map(o => o.id === order.id ? { ...o, tracking_substatus: value } : o) }))
    try {
      await api.put(`/orders/${order.id}/`, { tracking_substatus: value })
    } catch {
      fetchData()
    } finally {
      setSavingId(null)
    }
  }

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search) params.set('search', search)
    if (bucket) params.set('bucket', bucket)
    api.get(`/orders/carrier-tracking/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search, bucket])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, bucket])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {data.buckets.map(b => (
          <button
            key={b.key}
            onClick={() => setBucket(prev => prev === b.key ? '' : b.key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer
              ${bucket === b.key ? 'bg-violet-600 border-violet-600 text-white' : 'text-app-muted-light hover:text-app-primary'}`}
            style={bucket === b.key ? undefined : { borderColor: theme.dark.border }}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${bucket === b.key ? 'bg-white/20' : 'bg-violet-500/15 text-violet-300'}`}>
              {b.count}
            </span>
            {b.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tr('Nom, téléphone ou suivi…')}
          className="px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition w-full sm:w-72"
          style={{ borderColor: theme.dark.border }}
        />
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className={theme.btn.icon} title={tr('Rafraîchir')}>
            <RefreshIcon />
          </button>
          <button onClick={() => exportCsv(data.results)} disabled={!data.results.length} className={theme.btn.icon + ' disabled:opacity-30'} title={tr('Exporter en CSV')}>
            <DownloadIcon />
          </button>
          <button onClick={() => navigate('/dashboard/commandes/nouvelle')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition">
            <PlusIcon />{tr('Créer une commande')}</button>
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{tr('{{count}} commande', { count: data.count })}{data.count !== 1 ? sfx('s') : ''}{' '}{tr('en cours de livraison.')}</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-200">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-start text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">{tr('SUIVI')}</th>
              <th className="px-4 py-3 font-medium">{tr('CLIENT')}</th>
              <th className="px-4 py-3 font-medium">{tr('COMMUNE')}</th>
              <th className="px-4 py-3 font-medium">{tr('REMARQUE')}</th>
              <th className="px-4 py-3 font-medium">{tr('ÉTAT TRANSPORTEUR')}</th>
              <th className="px-4 py-3 font-medium">{tr('SOUS-STATUT')}</th>
              <th className="px-4 py-3 font-medium">{tr('PRIX TOTAL')}</th>
              <th className="px-4 py-3 font-medium">{tr('DATE')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>{tr('Chargement…')}</div>
              </td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={8}>
                <div className={theme.emptyState}>
                  <p>{tr('Aucune donnée')}</p>
                </div>
              </td></tr>
            ) : data.results.map(o => (
              <tr key={o.id} onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
                className="border-b hover:bg-violet-500/5 transition cursor-pointer" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3">
                  <p className="font-mono text-xs text-violet-300">{o.carrier_tracking_number || '—'}</p>
                  <p className="text-xs" style={{ color: theme.dark.muted }}>{o.carrier_label}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-app-primary font-medium">{o.first_name} {o.last_name}</p>
                  <p className="text-xs font-mono" style={{ color: theme.dark.muted }}>{o.phone}</p>
                </td>
                <td className="px-4 py-3 text-app-muted-light">{o.commune}</td>
                <td className="px-4 py-3 text-app-muted-light max-w-40 truncate">{o.note || '—'}</td>
                <td className="px-4 py-3">
                  <span className={theme.badge.warning}>{o.carrier_status || '—'}</span>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()} style={{ minWidth: 180 }}>
                  <Select
                    value={o.tracking_substatus || ''}
                    onChange={v => updateSubstatus(o, v)}
                    options={SUBSTATUS_OPTIONS}
                    disabled={savingId === o.id}
                    className="px-2.5 py-1.5 rounded-lg border text-xs text-app-primary"
                    style={{ background: 'transparent', borderColor: theme.dark.border }}
                  />
                </td>
                <td className="px-4 py-3 text-app-primary">{Number(o.total).toLocaleString('fr-DZ')}{' '}{tr('DZD')}</td>
                <td className="px-4 py-3 text-app-muted text-xs">{new Date(o.created_at).toLocaleDateString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > perPage && (
        <div className="flex items-center justify-end gap-2 mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">{tr('← Précédent')}</button>
          <span className={theme.badge.info}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">{tr('Suivant →')}</button>
        </div>
      )}
    </>
  )
}

export default function FailureReasonsPage() {
  const { t: tr } = useTranslation('dashboard')
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
    if (!confirm(tr('Supprimer cette raison ?'))) return
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
    <DashboardLayout title={tr('Raisons d\'échec')} subtitle={tr('Quand un confirmateur appelle un client et n\'arrive pas à confirmer la commande, il doit choisir une raison ("ne répond pas", "a changé d\'avis"...). L\'onglet "Raisons" sert à créer et modifier la liste de ces motifs proposés à vos confirmateurs. L\'onglet "Historique des échecs" vous montre chaque tentative ratée, avec des filtres par raison, par confirmateur ou par client — utile pour repérer un problème récurrent (un confirmateur qui échoue souvent, un motif très fréquent...).')}>
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
      ) : tab === 'historique' ? (
        <HistoryTab reasons={reasons} initialFilters={historyFilters} />
      ) : (
        <CarrierTrackingTab />
      )}
    </DashboardLayout>
  )
}
