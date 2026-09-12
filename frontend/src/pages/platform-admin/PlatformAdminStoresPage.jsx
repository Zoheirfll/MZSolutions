import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'

const MODE_OPTIONS = [
  { value: 'replace', label: 'Remplace les confirmateurs internes' },
  { value: 'augment', label: 'Coexiste avec les confirmateurs internes' },
]

export default function PlatformAdminStoresPage() {
  const [stores, setStores]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [toast, setToast]     = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/platform-admin/stores/', { params: { search: search || undefined, per_page: 100 } })
      .then(({ data }) => setStores(data.results))
      .catch(() => setToast({ type: 'error', message: 'Erreur de chargement des boutiques.' }))
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => { load() }, [load])

  const toggleActive = async (store) => {
    const nowActive = !(store.confirmation?.is_active)
    try {
      const { data } = await api.post(`/platform-admin/stores/${store.id}/toggle/`, { is_active: nowActive })
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, confirmation: data } : s))
      setToast({ type: 'success', message: nowActive ? 'Boutique activée pour le service de confirmation.' : 'Boutique désactivée.' })
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

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-primary">Boutiques</h1>
          <p className="text-sm text-app-muted mt-1">
            Activez le service de confirmation payant pour une boutique — décision unilatérale du superadmin.
          </p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une boutique…"
          className={theme.inputDark + ' max-w-xs'}
        />
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
              <th className="px-4 py-3">Boutique</th>
              <th className="px-4 py-3">Propriétaire</th>
              <th className="px-4 py-3">Service actif</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Accès</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-app-muted">Chargement…</td></tr>
            )}
            {!loading && stores.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-app-muted">Aucune boutique.</td></tr>
            )}
            {!loading && stores.map(store => {
              const active = !!store.confirmation?.is_active
              return (
                <tr key={store.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                  <td className="px-4 py-3 text-app-primary font-medium">{store.name}</td>
                  <td className="px-4 py-3 text-app-muted">{store.owner_email || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(store)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        active ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30' : 'bg-(--bg-card-alt) text-app-muted-light ring-1 ring-inset ring-(--border-color-hover)'
                      }`}
                    >
                      {active ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 w-64">
                    <Select
                      value={store.confirmation?.mode || 'replace'}
                      onChange={v => changeMode(store, v)}
                      options={MODE_OPTIONS}
                      disabled={!active}
                      className={theme.inputDark + ' py-1.5 text-xs'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {active ? (
                      <div className="flex gap-2">
                        <Link to={`/platform-admin/boutiques/${store.id}/commandes`} className="text-violet-400 hover:text-violet-300 text-xs font-medium">Commandes</Link>
                        <Link to={`/platform-admin/boutiques/${store.id}/produits`} className="text-violet-400 hover:text-violet-300 text-xs font-medium">Produits</Link>
                      </div>
                    ) : <span className="text-app-muted text-xs">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
