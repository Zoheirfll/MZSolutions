import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import BlockPhoneModal from '../../components/BlockPhoneModal'
import ClientOrdersModal from '../../components/ClientOrdersModal'
import api from '../../api/axios'
import { theme } from '../../theme'

const PER_PAGE_OPTIONS = [10, 25, 50]

function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
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

function HistoryIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function Spinner({ label = 'Chargement…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">{label}</span>
    </div>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-gray-500">
      {icon && <div className="mb-3 text-gray-600">{icon}</div>}
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{subtitle}</p>}
    </div>
  )
}

export default function BlacklistPage() {
  const [data, setData]         = useState({ results: [], count: 0 })
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [perPage, setPerPage]   = useState(10)
  const [loading, setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [historyEntry, setHistoryEntry] = useState(null)

  const fetchEntries = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search) params.set('search', search)
    api.get(`/orders/blacklist/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, search])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const handleDelete = async (id) => {
    if (!confirm('Débloquer ce numéro ?')) return
    await api.delete(`/orders/blacklist/${id}/`)
    fetchEntries()
  }

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <DashboardLayout title="Liste noire">
      {modalOpen && (
        <BlockPhoneModal onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchEntries() }} />
      )}
      {editingEntry && (
        <BlockPhoneModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={() => { setEditingEntry(null); fetchEntries() }} />
      )}
      {historyEntry && (
        <ClientOrdersModal phone={historyEntry.phone} name={historyEntry.phone} onClose={() => setHistoryEntry(null)} />
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Recherche par téléphone"
          className="px-4 py-2 rounded-lg text-sm text-gray-200 border outline-none focus:border-violet-500 transition w-full sm:w-72"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
        <div className="flex items-center gap-3 shrink-0">
          <p className="text-sm" style={{ color: theme.dark.muted }}>{data.count} numéro{data.count !== 1 ? 's' : ''} bloqué{data.count !== 1 ? 's' : ''}</p>
          <button onClick={() => setModalOpen(true)} className={theme.btn.primary + ' text-sm shrink-0'}>
            <PlusIcon /> Ajouter
          </button>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">MESSAGE</th>
              <th className="px-4 py-3 font-medium">TENTATIVES BLOQUÉES</th>
              <th className="px-4 py-3 font-medium">DERNIÈRE TENTATIVE</th>
              <th className="px-4 py-3 font-medium">CRÉÉ À</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><Spinner /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState icon={<ShieldIcon />} title="Aucun numéro bloqué" subtitle="Bloquez un client problématique pour empêcher ses futures commandes." />
              </td></tr>
            ) : data.results.map(e => (
              <tr key={e.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-gray-200 font-mono text-xs">{e.phone}</td>
                <td className="px-4 py-3 text-gray-400 max-w-56 truncate" title={e.message}>{e.message || '—'}</td>
                <td className="px-4 py-3">
                  <span className={e.blocked_attempts > 0 ? theme.badge.danger : theme.badge.neutral}>{e.blocked_attempts}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {e.last_attempt_at ? new Date(e.last_attempt_at).toLocaleString('fr-DZ') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(e.created_at).toLocaleDateString('fr-DZ')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setHistoryEntry(e)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition cursor-pointer" title="Historique des commandes"><HistoryIcon /></button>
                    <button onClick={() => setEditingEntry(e)} className="p-1.5 rounded text-gray-300 hover:bg-white/10 transition cursor-pointer" title="Modifier le message"><PencilIcon /></button>
                    <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Débloquer"><TrashIcon /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <div className="flex items-center gap-2 text-xs">
            Lignes par page :
            <Select value={perPage} onChange={v => { setPerPage(Number(v)); setPage(1) }}
              options={PER_PAGE_OPTIONS.map(n => ({ value: n, label: n }))}
              className="px-2 py-1 rounded-lg border text-gray-300 text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">← Précédent</button>
            <span className={theme.badge.info}>{page}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">Suivant →</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
