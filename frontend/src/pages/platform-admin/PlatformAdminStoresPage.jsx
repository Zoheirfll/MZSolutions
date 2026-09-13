import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import StatCard from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'

const SERVICE_OPTIONS = [
  { value: '',         label: 'Tous les statuts' },
  { value: 'active',   label: 'Service actif' },
  { value: 'inactive', label: 'Service inactif' },
]

const MODE_FILTER_OPTIONS = [
  { value: '',        label: 'Tous les modes' },
  { value: 'replace', label: 'Remplace' },
  { value: 'augment', label: 'Coexiste' },
]

const MODE_OPTIONS = [
  { value: 'replace', label: 'Remplace les confirmateurs internes' },
  { value: 'augment', label: 'Coexiste avec les confirmateurs internes' },
]

const PER_PAGE_OPTIONS = [10, 20, 50]

function StoreIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9l1.5-5h15L21 9M3 9v10a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1V9M3 9h18" />
    </svg>
  )
}
function CheckCircleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" />
    </svg>
  )
}
function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
    </svg>
  )
}
function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-8 0" />
    </svg>
  )
}
function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" /><path d="M3 21v-5h5" />
    </svg>
  )
}
function ChevronLeftIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}><path d="M15 18l-6-6 6-6" /></svg>
}
function ChevronRightIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}><path d="M9 18l6-6-6-6" /></svg>
}
function SearchIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
}

export default function PlatformAdminStoresPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [entering, setEntering] = useState(null)
  const [stores, setStores]     = useState([])
  const [stats, setStats]       = useState(null)
  const [count, setCount]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [serviceF, setServiceF] = useState('')
  const [modeF, setModeF]       = useState('')
  const [page, setPage]         = useState(1)
  const [perPage, setPerPage]   = useState(20)
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [toast, setToast]       = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/platform-admin/stores/', {
      params: {
        search: search || undefined,
        service: serviceF || undefined,
        mode: modeF || undefined,
        page, per_page: perPage,
      },
    })
      .then(({ data }) => { setStores(data.results); setStats(data.stats); setCount(data.count) })
      .catch(() => setToast({ type: 'error', message: 'Erreur de chargement des boutiques.' }))
      .finally(() => setLoading(false))
  }, [search, serviceF, modeF, page, perPage])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, serviceF, modeF])
  useEffect(() => { setSelected(new Set()) }, [stores])

  const totalPages = Math.max(1, Math.ceil(count / perPage))
  const activeFilterCount = [serviceF, modeF, search].filter(Boolean).length

  const handleEnter = async (store) => {
    setEntering(store.id)
    try {
      await api.post(`/platform-admin/stores/${store.id}/enter/`)
      await refresh()
      navigate('/dashboard')
    } catch {
      setToast({ type: 'error', message: "Impossible d'entrer dans cette boutique." })
      setEntering(null)
    }
  }

  const toggleActive = async (store) => {
    const nowActive = !(store.confirmation?.is_active)
    try {
      const { data } = await api.post(`/platform-admin/stores/${store.id}/toggle/`, { is_active: nowActive })
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, confirmation: data } : s))
      setToast({ type: 'success', message: nowActive ? `Service activé pour ${store.name}.` : `Service désactivé pour ${store.name}.` })
      load()
    } catch {
      setToast({ type: 'error', message: 'Échec de la mise à jour.' })
    }
  }

  const changeMode = async (store, mode) => {
    try {
      const { data } = await api.post(`/platform-admin/stores/${store.id}/toggle/`, { mode })
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, confirmation: data } : s))
    } catch {
      setToast({ type: 'error', message: 'Échec de la mise à jour du mode.' })
    }
  }

  const toggleRow = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allChecked = stores.length > 0 && selected.size === stores.length
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(stores.map(s => s.id)))

  const handleBulkToggle = async (isActive) => {
    setBulkBusy(true)
    try {
      await api.post('/platform-admin/stores/bulk-toggle/', { store_ids: [...selected], is_active: isActive })
      setToast({ type: 'success', message: `${selected.size} boutique(s) ${isActive ? 'activée(s)' : 'désactivée(s)'}.` })
      setSelected(new Set())
      load()
    } catch {
      setToast({ type: 'error', message: 'Échec de la mise à jour groupée.' })
    } finally {
      setBulkBusy(false)
    }
  }

  const pageNumbers = useMemo(() => {
    const span = Math.min(totalPages, 5)
    const start = Math.max(1, Math.min(page - Math.floor(span / 2), totalPages - span + 1))
    return Array.from({ length: span }, (_, i) => start + i)
  }, [page, totalPages])

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-app-primary">Boutiques</h1>
        <p className="text-sm text-app-muted mt-1 max-w-3xl">
          Activez le service de confirmation payant pour une boutique — décision unilatérale du superadmin, indépendante de ce que le vendeur souhaite. En mode « Remplace », le round-robin interne de la boutique est sauté ; en mode « Coexiste », les deux tournent en parallèle.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Boutiques MZSolutions" value={stats?.total ?? '—'} icon={StoreIcon} color="blue" />
        <StatCard label="Service actif" value={stats?.active ?? '—'} sub={stats?.total ? `${Math.round((stats.active / stats.total) * 100)}%` : undefined} icon={CheckCircleIcon} color="green" />
        <StatCard label="Mode « Remplace »" value={stats?.replace ?? '—'} icon={ShieldIcon} color="violet" />
        <StatCard label="Mode « Coexiste »" value={stats?.augment ?? '—'} icon={UsersIcon} color="orange" />
      </div>

      {/* Barre d'actions / filtres */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {selected.size > 0 ? (
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={theme.badge.info}>{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
            <button onClick={() => handleBulkToggle(true)} disabled={bulkBusy} className={theme.btn.secondary}>
              Activer le service
            </button>
            <button onClick={() => handleBulkToggle(false)} disabled={bulkBusy} className={theme.btn.ghost}>
              Désactiver le service
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted-light pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Boutique ou propriétaire…"
                className={theme.inputDark + ' pl-9 w-full sm:w-64'}
              />
            </div>
            <Select value={serviceF} onChange={setServiceF} options={SERVICE_OPTIONS} className={theme.inputDark + ' w-48'} />
            <Select value={modeF} onChange={setModeF} options={MODE_FILTER_OPTIONS} className={theme.inputDark + ' w-44'} />
            {activeFilterCount > 0 && (
              <button onClick={() => { setSearch(''); setServiceF(''); setModeF('') }} className="text-xs text-app-muted-light hover:text-app-primary underline underline-offset-2">
                Réinitialiser
              </button>
            )}
          </div>
        )}
        <button onClick={load} className="w-9 h-9 rounded-lg border flex items-center justify-center text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 transition shrink-0"
          style={{ borderColor: 'var(--border-color)' }} title="Actualiser">
          <RefreshIcon className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
        <table className="w-full text-sm min-w-225">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-violet-600 w-4 h-4 cursor-pointer" aria-label="Tout sélectionner" /></th>
              <th className="px-4 py-3">Boutique</th>
              <th className="px-4 py-3">Propriétaire</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Confirmateurs</th>
              <th className="px-4 py-3">Activé le</th>
              <th className="px-4 py-3">Accès</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            )}
            {!loading && stores.length === 0 && (
              <tr><td colSpan={8}>
                <div className={theme.emptyState}>
                  <StoreIcon className="w-12 h-12 mb-3 opacity-40" />
                  <p>Aucune boutique ne correspond à ces filtres.</p>
                </div>
              </td></tr>
            )}
            {!loading && stores.map(store => {
              const active = !!store.confirmation?.is_active
              return (
                <tr key={store.id} className="border-b last:border-0 hover:bg-violet-500/5 transition-colors" style={{ borderColor: theme.dark.borderRowHover }}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(store.id)} onChange={() => toggleRow(store.id)} className="accent-violet-600 w-4 h-4 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-app-primary font-medium">{store.name}</p>
                    <p className="text-xs text-app-muted-light">/{store.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-app-muted">{store.owner_email || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(store)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        active ? theme.badge.success : theme.badge.neutral
                      }`}
                    >
                      {active ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 w-60">
                    <Select
                      value={store.confirmation?.mode || 'replace'}
                      onChange={v => changeMode(store, v)}
                      options={MODE_OPTIONS}
                      disabled={!active}
                      className={theme.inputDark + ' py-1.5 text-xs'}
                    />
                  </td>
                  <td className="px-4 py-3 text-app-muted">
                    {active ? (store.confirmation?.assigned_count ?? 0) : '—'}
                  </td>
                  <td className="px-4 py-3 text-app-muted-light whitespace-nowrap">
                    {store.confirmation?.activated_at ? new Date(store.confirmation.activated_at).toLocaleDateString('fr-DZ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {active ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link to={`/platform-admin/boutiques/${store.id}/commandes`} className="text-violet-400 hover:text-violet-300 text-xs font-medium">Commandes</Link>
                        <Link to={`/platform-admin/boutiques/${store.id}/produits`} className="text-violet-400 hover:text-violet-300 text-xs font-medium">Produits</Link>
                        <button onClick={() => handleEnter(store)} disabled={entering === store.id}
                          className="text-xs font-semibold px-2.5 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-500 transition disabled:opacity-50 cursor-pointer">
                          {entering === store.id ? 'Entrée…' : 'Gérer cette boutique'}
                        </button>
                      </div>
                    ) : <span className="text-app-muted text-xs">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm" style={{ color: theme.dark.muted }}>
        <p>{count} boutique{count > 1 ? 's' : ''} au total</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            Lignes par page :
            <Select value={perPage} onChange={v => setPerPage(Number(v))}
              options={PER_PAGE_OPTIONS.map(n => ({ value: n, label: n }))}
              className="px-2 py-1 rounded-lg border text-app-primary text-xs" style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }} />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-violet-500/5 flex items-center justify-center">
              <ChevronLeftIcon />
            </button>
            {pageNumbers.map(n => (
              <button key={n} onClick={() => setPage(n)} className="px-2.5 py-1 rounded text-xs"
                style={{ background: page === n ? '#7c3aed' : 'transparent', color: page === n ? '#fff' : theme.dark.muted }}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-violet-500/5 flex items-center justify-center">
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
