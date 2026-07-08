import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import DashboardLayout from '../../components/DashboardLayout'
import StatusBadge from '../../components/StatusBadge'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'
import { WILAYAS, getWilayaIdByName } from '../../data/wilayas'
import { getCommunesForWilaya } from '../../data/communes'

const STATUS_OPTIONS = [
  { value: '',            label: 'Tous les statuts' },
  { value: 'scheduled',   label: 'Programmée' },
  { value: 'pending',     label: 'En attente de confirmation' },
  { value: 'no_answer_1', label: 'Non joignable — 1ère tentative' },
  { value: 'no_answer_2', label: 'Non joignable — 2ème tentative' },
  { value: 'no_answer_3', label: 'Non joignable — 3ème tentative' },
  { value: 'confirmed',   label: 'Confirmée' },
  { value: 'shipped',     label: 'Expédiée' },
  { value: 'delivered',   label: 'Livrée' },
  { value: 'returned',    label: 'Retournée' },
  { value: 'cancelled',   label: 'Annulée' },
]

const PER_PAGE_OPTIONS = [10, 25, 50]

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function ColumnsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  )
}

function PrintIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M6 9V3h12v6" />
      <rect x="6" y="14" width="12" height="7" />
      <rect x="4" y="9" width="16" height="7" rx="1" />
    </svg>
  )
}

function AssignIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M16 4h4v4M20 4l-7 7" />
      <circle cx="8" cy="9" r="3" />
      <path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  )
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
    </svg>
  )
}

function HistoryIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function ChevronLeftIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function SortIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M3 7h11M3 12h7M3 17h4" />
      <path d="M17 4v16M17 4l-3 3M17 4l3 3" />
    </svg>
  )
}

function DownloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  )
}

function FilterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M4 5h16l-6 7v6l-4 2v-8L4 5z" />
    </svg>
  )
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

// Menu générique bouton-icône + panneau flottant (tri / export) — ferme au clic extérieur.
function IconMenu({ icon, title, children, panelClassName = 'w-56', panelAlign = 'right', triggerClassName, triggerStyle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={triggerClassName || 'w-9 h-9 rounded-lg border flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-white/5 transition'}
        style={triggerStyle || (triggerClassName ? undefined : { borderColor: theme.dark.border })}
        title={title}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {icon}
      </button>
      {open && (
        <div
          className={`absolute ${panelAlign === 'left' ? 'left-0' : 'right-0'} z-50 mt-1.5 rounded-lg border shadow-xl py-1 ${panelClassName}`}
          style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}

// Menu à choix unique (tri) — la ligne active est mise en avant (fond violet), les autres restent neutres.
function MenuItem({ onClick, children, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 text-left px-3.5 py-2 text-sm transition-colors duration-100 cursor-pointer ${
        active ? 'bg-violet-600/20 text-violet-300' : 'text-gray-300 hover:bg-white/6'
      }`}
    >
      <span>{children}</span>
      {active && <CheckIcon className="shrink-0" />}
    </button>
  )
}

// Menu à choix multiple (colonnes) — chaque ligne reste neutre, seule une case à cocher
// indique l'état ; contrairement à MenuItem, il ne faut pas surligner tout le menu quand
// tout est coché (ce qui arrive par défaut ici, puisque toutes les colonnes sont visibles).
function CheckMenuItem({ onClick, children, checked }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 text-sm text-gray-300 hover:bg-white/6 transition-colors duration-100 cursor-pointer"
    >
      <span
        className={`shrink-0 w-4 h-4 rounded flex items-center justify-center ring-1 ring-inset transition-colors ${
          checked ? 'bg-violet-600 ring-violet-600' : 'bg-transparent ring-white/20'
        }`}
      >
        {checked && <CheckIcon className="text-white" width={11} height={11} />}
      </span>
      {children}
    </button>
  )
}

const SORT_OPTIONS = [
  { field: 'created_at', dir: 'desc', label: 'Créé le — plus récent' },
  { field: 'created_at', dir: 'asc',  label: 'Créé le — plus ancien' },
  { field: 'updated_at', dir: 'desc', label: 'Mis à jour le — plus récent' },
  { field: 'updated_at', dir: 'asc',  label: 'Mis à jour le — plus ancien' },
]

const ORDER_EXPORT_COLUMNS = [
  { header: 'ID',        get: o => o.id },
  { header: 'Nom',       get: o => `${o.first_name} ${o.last_name}` },
  { header: 'Téléphone', get: o => o.phone },
  { header: 'Wilaya',    get: o => o.wilaya },
  { header: 'Commune',   get: o => o.commune || '' },
  { header: 'Total (DZD)', get: o => Number(o.total) },
  { header: 'Statut',    get: o => o.status_label },
  { header: 'Note',      get: o => o.note || '' },
]

const ALL_COLUMNS = [
  { key: 'id',           label: 'ID' },
  { key: 'name',         label: 'NOM' },
  { key: 'phone',        label: 'NUMÉRO DE TÉLÉPHONE' },
  { key: 'wilaya',       label: 'EMPLACEMENT' },
  { key: 'total',        label: 'PRIX TOTAL' },
  { key: 'status',       label: 'SUIVI' },
  { key: 'commune',      label: 'COMMUNE' },
  { key: 'note',         label: 'NOTE' },
  { key: 'date',         label: 'DATE' },
  { key: 'carrier',      label: 'TRANSPORTEUR' },
  { key: 'confirmateur', label: 'CONFIRMATEUR' },
]

const DEFAULT_VISIBLE_COLUMNS = new Set(ALL_COLUMNS.map(c => c.key))

function exportOrdersToXlsx(orders) {
  const rows = orders.map(o => Object.fromEntries(ORDER_EXPORT_COLUMNS.map(c => [c.header, c.get(o)])))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Commandes')
  XLSX.writeFile(book, `commandes_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function exportOrdersToPdf(orders) {
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(12)
  doc.text('Commandes', 14, 12)
  autoTable(doc, {
    startY: 18,
    head: [ORDER_EXPORT_COLUMNS.map(c => c.header)],
    body: orders.map(o => ORDER_EXPORT_COLUMNS.map(c => String(c.get(o)))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [124, 58, 237] },
  })
  doc.save(`commandes_${new Date().toISOString().slice(0, 10)}.pdf`)
}

const EMPTY_FILTERS = {
  date_from: '', date_to: '', order_id: '', product: '', category: '',
  confirmateur: '', phone: '', wilaya: '', carrier: '', duplicates_only: false,
}

function FilterModal({ filters, onClose, onApply }) {
  const [form, setForm] = useState(filters)
  const [confirmateurs, setConfirmateurs] = useState([])
  const [carriers, setCarriers] = useState([])

  useEffect(() => {
    api.get('/team/members/?role=confirmateur').then(({ data }) => setConfirmateurs(data)).catch(() => {})
    api.get('/stores/me/carriers/').then(({ data }) => setCarriers(data)).catch(() => {})
  }, [])

  const set = (key) => (v) => setForm(f => ({ ...f, [key]: v }))
  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border, background: theme.dark.sidebar }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border p-5 sm:p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-5">Filtrage</h2>

        <div className="mb-4">
          <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Sélectionner la date</label>
          <div className="flex items-center gap-2">
            <input type="date" value={form.date_from} onChange={e => set('date_from')(e.target.value)} className={inputCls} style={bdrStyle} />
            <span style={{ color: theme.dark.muted }}>→</span>
            <input type="date" value={form.date_to} onChange={e => set('date_to')(e.target.value)} className={inputCls} style={bdrStyle} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>ID de commande</label>
            <input value={form.order_id} onChange={e => set('order_id')(e.target.value)} className={inputCls} style={bdrStyle} placeholder="ID de commande" />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Recherche par produit</label>
            <input value={form.product} onChange={e => set('product')(e.target.value)} className={inputCls} style={bdrStyle} placeholder="Recherche par produit" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Agent de confirmation</label>
            <Select
              value={form.confirmateur}
              onChange={set('confirmateur')}
              options={[{ value: '', label: 'Tous' }, ...confirmateurs.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name}` }))]}
              className={inputCls}
              style={bdrStyle}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Recherche par catégorie</label>
            <input value={form.category} onChange={e => set('category')(e.target.value)} className={inputCls} style={bdrStyle} placeholder="Recherche par catégorie" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Numéro de téléphone</label>
            <input value={form.phone} onChange={e => set('phone')(e.target.value)} className={inputCls} style={bdrStyle} placeholder="Numéro de téléphone" />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Nom de la wilaya</label>
            <Select
              value={form.wilaya}
              onChange={set('wilaya')}
              options={[{ value: '', label: 'Toutes' }, ...WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))]}
              className={inputCls}
              style={bdrStyle}
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Entreprise de livraison</label>
          <Select
            value={form.carrier}
            onChange={set('carrier')}
            options={[{ value: '', label: 'Toutes' }, ...carriers.map(c => ({ value: c.id, label: c.name }))]}
            className={inputCls}
            style={bdrStyle}
          />
        </div>

        <label className="flex items-center gap-3 mb-6 cursor-pointer select-none">
          <button
            type="button"
            role="switch"
            aria-checked={form.duplicates_only}
            onClick={() => set('duplicates_only')(!form.duplicates_only)}
            className="w-10 h-6 rounded-full relative transition-colors shrink-0"
            style={{ background: form.duplicates_only ? '#7c3aed' : theme.dark.border }}
          >
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: form.duplicates_only ? 'translateX(18px)' : 'translateX(2px)' }} />
          </button>
          <span className="text-sm text-gray-300">Afficher les doubles commandes</span>
        </label>

        <div className="flex justify-between gap-3">
          <button onClick={() => setForm(EMPTY_FILTERS)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition">Réinitialiser</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition">Fermer</button>
            <button onClick={() => onApply(form)} className={theme.btn.primary}>Appliquer</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const NO_ANSWER_STATUSES = ['no_answer_1', 'no_answer_2', 'no_answer_3']

function QuickEditModal({ order, onClose, onSaved }) {
  const [status,  setStatus]  = useState('')
  const [note,    setNote]    = useState(order.note || '')
  const [wilaya,  setWilaya]  = useState(order.wilaya || '')
  const [commune, setCommune] = useState(order.commune || '')
  const [saving,  setSaving]  = useState(false)
  const [failureReasons, setFailureReasons] = useState([])
  const [failureReason,  setFailureReason]  = useState('')

  useEffect(() => {
    api.get('/orders/failure-reasons/?active=1').then(({ data }) => setFailureReasons(data)).catch(() => {})
  }, [])

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border, background: theme.dark.sidebar }
  const showFailureReason = NO_ANSWER_STATUSES.includes(status)

  const handleSave = async () => {
    setSaving(true)
    try {
      if (wilaya !== order.wilaya || commune !== order.commune || note !== order.note) {
        await api.put(`/orders/${order.id}/`, { wilaya, commune, note })
      }
      if (status && status !== order.status) {
        await api.post(`/orders/${order.id}/status/`, { status, note })
        if (showFailureReason && failureReason) {
          await api.post(`/orders/${order.id}/call-attempts/`, { status: 'no_answer', failure_reason: failureReason, note })
        }
      }
      onSaved()
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border p-5 sm:p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-5">État de la commande</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Statut actuel</label>
            <p className="text-sm text-gray-200 font-medium py-2">{order.status_label}</p>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Sélectionner un nouveau statut</label>
            <Select
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS.filter(s => s.value && s.value !== 'scheduled')}
              placeholder="— Choisir —"
              className={inputCls}
              style={bdrStyle}
            />
          </div>
        </div>

        {showFailureReason && (
          <div className="mb-4">
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Raison (optionnel)</label>
            <Select
              value={failureReason}
              onChange={setFailureReason}
              options={failureReasons.map(r => ({ value: r.id, label: r.label }))}
              placeholder={failureReasons.length ? '— Choisir —' : 'Aucune raison configurée'}
              disabled={failureReasons.length === 0}
              className={inputCls}
              style={bdrStyle}
            />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Commentaire interne</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} style={bdrStyle} placeholder="Note libre…" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Wilaya</label>
            <Select
              value={wilaya}
              onChange={v => { setWilaya(v); setCommune('') }}
              options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
              placeholder="Choisissez une Wilaya"
              className={inputCls}
              style={bdrStyle}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Commune</label>
            <Select
              value={commune}
              onChange={setCommune}
              options={getCommunesForWilaya(getWilayaIdByName(wilaya)).map(name => ({ value: name, label: name }))}
              placeholder={wilaya ? 'Choisissez une commune' : "Choisissez d'abord une wilaya"}
              disabled={!wilaya}
              className={inputCls}
              style={bdrStyle}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition">Fermer</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
            {saving ? '…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryModal({ orderId, onClose }) {
  const [order,   setOrder]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/orders/${orderId}/`).then(({ data }) => setOrder(data)).finally(() => setLoading(false))
  }, [orderId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border p-5 sm:p-6 max-h-[85vh] overflow-y-auto"
        style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-5">Historique de la commande N° {orderId}</h2>

        {loading ? (
          <p className="text-center text-gray-500 py-8">Chargement…</p>
        ) : (
          <>
            {order?.note && (
              <p className="text-center text-sm text-violet-300 font-medium mb-5">Note : {order.note}</p>
            )}
            {!order?.history?.length ? (
              <p className="text-center text-gray-500 py-4">Aucun historique</p>
            ) : (
              <div className="space-y-4 border-l pl-4" style={{ borderColor: theme.dark.border }}>
                {order.history.map(h => (
                  <div key={h.id}>
                    <p className="text-xs" style={{ color: theme.dark.muted }}>{new Date(h.changed_at).toLocaleString('fr-DZ')}</p>
                    <span className="inline-block mt-1">
                      <StatusBadge status={h.status} label={h.status_label} />
                    </span>
                    {h.note && <p className="text-xs text-gray-400 mt-1">{h.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition">Fermer</button>
        </div>
      </div>
    </div>
  )
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [data,     setData]     = useState({ results: [], count: 0 })
  const [statusF,  setStatusF]  = useState('')
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(1)
  const [perPage,  setPerPage]  = useState(10)
  const [selected, setSelected] = useState(new Set())
  const [loading,  setLoading]  = useState(true)
  const [quickEdit, setQuickEdit] = useState(null)
  const [historyId, setHistoryId] = useState(null)
  const [sort, setSort] = useState(SORT_OPTIONS[0])
  const [filters, setFilters] = useState(() => {
    const confirmateur = new URLSearchParams(location.search).get('confirmateur')
    return confirmateur ? { ...EMPTY_FILTERS, confirmateur } : EMPTY_FILTERS
  })
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [statusCounts, setStatusCounts] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE_COLUMNS)
  const [confirmateurs, setConfirmateurs] = useState([])
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    api.get('/orders/stats/').then(({ data: d }) => setStatusCounts(d)).catch(() => {})
    api.get('/team/members/?role=confirmateur').then(({ data: d }) => setConfirmateurs(d)).catch(() => {})
  }, [])

  const toggleColumn = (key) => setVisibleCols(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v !== EMPTY_FILTERS[k]).length

  const buildParams = useCallback((overrides = {}) => {
    const params = new URLSearchParams({
      page: overrides.page ?? page,
      per_page: perPage,
      ordering: sort.field,
      ordering_dir: sort.dir,
    })
    if (statusF) params.set('status', statusF)
    if (search)  params.set('search', search)
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return
      params.set(key, key === 'duplicates_only' ? '1' : value)
    })
    return params
  }, [page, perPage, statusF, search, sort, filters])

  const fetchOrders = useCallback(() => {
    setLoading(true)
    api.get(`/orders/?${buildParams()}`)
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [buildParams])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [statusF, search, sort, filters])

  const handleExport = async (format) => {
    setExporting(true)
    try {
      const params = buildParams({ page: 1 })
      params.set('per_page', Math.max(data.count, 1))
      const { data: d } = await api.get(`/orders/?${params}`)
      const rows = d.results || []
      if (format === 'xlsx') exportOrdersToXlsx(rows)
      else exportOrdersToPdf(rows)
    } catch {} finally { setExporting(false) }
  }

  const orders     = data.results || []
  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const allIds     = orders.map(o => o.id)
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id))

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(allIds))
  const toggleRow = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleDelete = async id => {
    if (!confirm('Supprimer cette commande ?')) return
    await api.delete(`/orders/${id}/`)
    fetchOrders()
  }

  const handleBulkAssign = async (confirmateurId) => {
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(id => api.put(`/orders/${id}/assignment/`, { confirmateur: confirmateurId })))
      setSelected(new Set())
      fetchOrders()
    } catch {} finally { setBulkBusy(false) }
  }

  const handleBulkPrint = () => {
    const rows = orders.filter(o => selected.has(o.id))
    exportOrdersToPdf(rows)
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Supprimer ${selected.size} commande(s) ?`)) return
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(id => api.delete(`/orders/${id}/`)))
      setSelected(new Set())
      fetchOrders()
    } catch {} finally { setBulkBusy(false) }
  }

  return (
    <DashboardLayout title="Commandes">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        {selected.size > 0 ? (
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={theme.badge.info}>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>

            <IconMenu
              icon={<><AssignIcon className="shrink-0" /> Assigner à</>}
              title="Assigner à un confirmateur"
              panelClassName="w-52"
              panelAlign="left"
              triggerClassName={theme.btn.secondary}
            >
              {(close) => confirmateurs.length === 0 ? (
                <p className="px-3.5 py-2 text-sm text-gray-500">Aucun confirmateur actif</p>
              ) : confirmateurs.map(c => (
                <MenuItem key={c.id} onClick={() => { close(); handleBulkAssign(c.id) }}>
                  {c.first_name} {c.last_name}
                </MenuItem>
              ))}
            </IconMenu>
            <button onClick={handleBulkPrint} disabled={bulkBusy} className={theme.btn.secondary}>
              <PrintIcon /> Imprimer
            </button>
            <button onClick={handleBulkDelete} disabled={bulkBusy} className={theme.btn.danger}>
              <TrashIcon /> Supprimer
            </button>
          </div>
        ) : (
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <Select
            value={statusF}
            onChange={setStatusF}
            options={STATUS_OPTIONS}
            className="px-3 py-2 rounded-lg border text-sm text-gray-200 outline-none w-full sm:w-auto"
            style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 200 }}
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Recherche nom, téléphone…"
            className="px-3 py-2 rounded-lg border text-sm text-gray-200 outline-none focus:border-violet-500 transition w-full sm:w-55"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          />
        </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={fetchOrders} className="w-9 h-9 rounded-lg border flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-white/5 transition" style={{ borderColor: theme.dark.border }} title="Actualiser">
            <RefreshIcon />
          </button>

          <IconMenu icon={<SortIcon />} title="Trier">
            {(close) => SORT_OPTIONS.map(opt => (
              <MenuItem
                key={`${opt.field}-${opt.dir}`}
                active={sort.field === opt.field && sort.dir === opt.dir}
                onClick={() => { setSort(opt); close() }}
              >
                {opt.label}
              </MenuItem>
            ))}
          </IconMenu>

          <IconMenu icon={exporting ? <RefreshIcon className="animate-spin" /> : <DownloadIcon />} title="Exporter">
            {(close) => (
              <>
                <MenuItem onClick={() => { close(); handleExport('xlsx') }}>Exporter la vue actuelle en XLSX</MenuItem>
                <MenuItem onClick={() => { close(); handleExport('pdf') }}>Exporter la vue actuelle en PDF</MenuItem>
              </>
            )}
          </IconMenu>

          <button
            onClick={() => setShowFilterModal(true)}
            className="h-9 px-3 rounded-lg border flex items-center gap-2 text-gray-400 hover:text-gray-200 hover:bg-white/5 transition relative"
            style={{ borderColor: theme.dark.border }}
            title="Filtrage"
          >
            <FilterIcon />
            <span className="text-sm hidden sm:inline">Filtrage</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>

          <IconMenu icon={<ColumnsIcon />} title="Colonnes">
            {() => ALL_COLUMNS.map(col => (
              <CheckMenuItem
                key={col.key}
                checked={visibleCols.has(col.key)}
                onClick={() => toggleColumn(col.key)}
              >
                {col.label}
              </CheckMenuItem>
            ))}
          </IconMenu>

          <button
            onClick={() => navigate('/dashboard/commandes/nouvelle')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-violet-600 hover:bg-violet-500 transition"
            title="Nouvelle commande"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {/* Pastilles de statut avec compteurs — filtrage rapide en un clic */}
      {statusCounts && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {STATUS_OPTIONS.filter(s => s.value).map(s => {
            const count = statusCounts[s.value]?.count ?? 0
            if (!count) return null
            const active = statusF === s.value
            return (
              <button
                key={s.value}
                onClick={() => setStatusF(active ? '' : s.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ring-1 ring-inset transition cursor-pointer ${
                  active
                    ? 'bg-violet-500/10 text-violet-300 ring-violet-500/20 hover:bg-violet-500/15'
                    : 'bg-white/6 text-gray-400 ring-white/10 hover:bg-white/10'
                }`}
              >
                {count} {s.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-225">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-violet-600" /></th>
              {ALL_COLUMNS.filter(c => visibleCols.has(c.key)).map(c => (
                <th key={c.key} className="px-4 py-3 font-medium whitespace-nowrap">{c.label}</th>
              ))}
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={visibleCols.size + 2} className="py-16">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={visibleCols.size + 2}>
                <div className={theme.emptyState}>
                  <svg className="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="7" width="18" height="14" rx="2" />
                    <path d="M8 7V5a4 4 0 018 0v2" />
                  </svg>
                  <p>Aucune commande trouvée</p>
                </div>
              </td></tr>
            ) : orders.map(o => (
              <tr
                key={o.id}
                className="border-b hover:bg-white/2 transition cursor-pointer"
                style={{ borderColor: theme.dark.borderRowHover }}
                onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
              >
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleRow(o.id)} className="accent-violet-600" />
                </td>
                {visibleCols.has('id') && <td className="px-4 py-3 text-gray-500">#{o.id}</td>}
                {visibleCols.has('name') && <td className="px-4 py-3 text-gray-200 font-medium">{o.first_name} {o.last_name}</td>}
                {visibleCols.has('phone') && <td className="px-4 py-3 text-gray-300">{o.phone}</td>}
                {visibleCols.has('wilaya') && <td className="px-4 py-3 text-gray-300">{o.wilaya}</td>}
                {visibleCols.has('total') && <td className="px-4 py-3 text-gray-200 font-semibold">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>}
                {visibleCols.has('status') && (
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setQuickEdit(o)} className="hover:opacity-80 transition">
                      <StatusBadge status={o.status} label={o.status_label} />
                    </button>
                  </td>
                )}
                {visibleCols.has('commune') && <td className="px-4 py-3 text-gray-400">{o.commune || '—'}</td>}
                {visibleCols.has('note') && <td className="px-4 py-3 text-gray-400 max-w-40 truncate" title={o.note}>{o.note || '—'}</td>}
                {visibleCols.has('date') && <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('fr-DZ')}</td>}
                {visibleCols.has('carrier') && <td className="px-4 py-3 text-gray-400">{o.carrier_label || '—'}</td>}
                {visibleCols.has('confirmateur') && <td className="px-4 py-3 text-gray-400">{o.confirmateur_name || '—'}</td>}
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setHistoryId(o.id)} className="text-gray-400 hover:text-violet-400 transition" title="Historique">
                    <HistoryIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 text-sm" style={{ color: theme.dark.muted }}>
        <p>{selected.size} de {data.count} sélectionné</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            Lignes par page :
            <Select value={perPage} onChange={v => { setPerPage(Number(v)); setPage(1) }}
              options={PER_PAGE_OPTIONS.map(n => ({ value: n, label: n }))}
              className="px-2 py-1 rounded-lg border text-gray-300 text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }} />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-white/5 flex items-center justify-center">
              <ChevronLeftIcon />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className="px-2.5 py-1 rounded text-xs"
                style={{ background: page === n ? '#7c3aed' : 'transparent', color: page === n ? '#fff' : theme.dark.muted }}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-white/5 flex items-center justify-center">
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>

      {quickEdit && (
        <QuickEditModal
          order={quickEdit}
          onClose={() => setQuickEdit(null)}
          onSaved={() => { setQuickEdit(null); fetchOrders() }}
        />
      )}

      {historyId && (
        <HistoryModal orderId={historyId} onClose={() => setHistoryId(null)} />
      )}

      {showFilterModal && (
        <FilterModal
          filters={filters}
          onClose={() => setShowFilterModal(false)}
          onApply={(form) => { setFilters(form); setShowFilterModal(false) }}
        />
      )}
    </DashboardLayout>
  )
}
