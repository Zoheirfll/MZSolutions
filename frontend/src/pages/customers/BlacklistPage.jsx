import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const EMPTY_FORM = { phone: '', message: '' }

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

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M12 5v14M5 12h14" />
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

function BlockModal({ onClose, onSaved }) {
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
      await api.post('/orders/blacklist/', form)
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
          <h3 className="font-semibold text-gray-200">Bloquer un numéro de téléphone</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Message</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3}
              className={`${inputCls} resize-none`} style={bdrStyle}
              placeholder="Entrez un message que vous devez montrer au client" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Numéro de téléphone *</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required
              className={inputCls} style={bdrStyle} placeholder="Entrez un numéro de téléphone à bloquer" />
            {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 cursor-pointer transition flex items-center gap-1.5">
              <ShieldIcon width={14} height={14} /> {saving ? '…' : 'Bloquer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function BlacklistPage() {
  const [entries, setEntries]     = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading]     = useState(true)

  const fetchEntries = () => {
    setLoading(true)
    api.get('/orders/blacklist/')
      .then(({ data }) => setEntries(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchEntries() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Débloquer ce numéro ?')) return
    await api.delete(`/orders/blacklist/${id}/`)
    fetchEntries()
  }

  return (
    <DashboardLayout title="Liste noire">
      {modalOpen && (
        <BlockModal onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchEntries() }} />
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{entries.length} numéro{entries.length !== 1 ? 's' : ''} bloqué{entries.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModalOpen(true)} className={theme.btn.primary + ' text-sm shrink-0'}>
          <PlusIcon /> Ajouter
        </button>
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
            ) : entries.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState icon={<ShieldIcon />} title="Aucun numéro bloqué" subtitle="Bloquez un client problématique pour empêcher ses futures commandes." />
              </td></tr>
            ) : entries.map(e => (
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
                  <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Débloquer"><TrashIcon /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
