import { useEffect, useState, useCallback, useRef } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const FILTERS = [
  { label: 'Tous',       value: '' },
  { label: 'En attente', value: '0' },
  { label: 'Approuvés',  value: '1' },
]

const PER_PAGE_OPTIONS = [10, 25, 50]

function Stars({ rating, onClick }) {
  return (
    <span className={onClick ? 'cursor-pointer' : ''}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          onClick={() => onClick && onClick(i)}
          className={'text-lg ' + (i <= rating ? 'text-amber-400' : 'text-gray-600') + (onClick ? ' cursor-pointer' : '')}
        >★</span>
      ))}
    </span>
  )
}

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function UploadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
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

function StarOutlineIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
    </svg>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
      <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">Chargement…</span>
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

function AddModal({ onClose, onSaved }) {
  const [products, setProducts] = useState([])
  const [search,   setSearch]   = useState('')
  const [form, setForm] = useState({
    product: '', first_name: '', last_name: '', email: '',
    rating: 5, comment: '', image: null,
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const fileRef = useRef()

  useEffect(() => {
    api.get('/products/').then(({ data }) => setProducts(data.results ?? data)).catch(() => {})
  }, [])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v !== null && v !== '') fd.append(k, v)
      })
      await api.post('/products/reviews/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onSaved()
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-xl border p-6 max-h-[90vh] overflow-y-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">Ajouter un avis</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">

          {/* Prénom + Nom */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Prénom *</label>
              <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Prénom" />
              {errors.first_name && <p className="text-red-400 text-xs mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Nom de famille</label>
              <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="Nom" />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="client@example.com" />
          </div>

          {/* Produit recherche */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Produit *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><SearchIcon /></span>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, product: '' })) }}
                className={inputCls + ' pl-8'}
                style={bdrStyle}
                placeholder="Recherche par produit"
              />
            </div>
            {search && !form.product && (
              <div className="rounded-lg border mt-1 max-h-36 overflow-y-auto" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
                {filtered.length === 0
                  ? <p className="px-3 py-2 text-xs text-gray-500">Aucun résultat</p>
                  : filtered.map(p => (
                    <button
                      key={p.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, product: p.id })); setSearch(p.name) }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition cursor-pointer"
                    >{p.name}</button>
                  ))
                }
              </div>
            )}
            {errors.product && <p className="text-red-400 text-xs mt-1">{errors.product}</p>}
          </div>

          {/* Rating */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Note</label>
            <Stars rating={form.rating} onClick={v => setForm(f => ({ ...f, rating: v }))} />
          </div>

          {/* Commentaire */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Commentaire</label>
            <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={3} className={inputCls + ' resize-none'} style={bdrStyle} placeholder="Contenu de l'avis…" />
          </div>

          {/* Image */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Image (optionnel)</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-violet-500 transition"
              style={{ borderColor: theme.dark.border }}
            >
              {form.image
                ? <p className="text-sm text-gray-300">{form.image.name}</p>
                : <><div className="flex justify-center mb-1 text-gray-500"><UploadIcon /></div><p className="text-xs text-gray-500">Choisissez un fichier ou faites-le glisser ici</p></>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setForm(f => ({ ...f, image: e.target.files[0] || null }))} />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving || !form.product} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 flex items-center gap-2 cursor-pointer transition">
              {saving ? 'Enregistrement…' : <>Créer <PlusIcon width={14} height={14} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ReviewsPage() {
  const [reviews,  setReviews]  = useState([])
  const [total,    setTotal]    = useState(0)
  const [filter,   setFilter]   = useState('')
  const [page,     setPage]     = useState(1)
  const [perPage,  setPerPage]  = useState(10)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [modal,    setModal]    = useState(false)

  const fetchReviews = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filter !== '') params.set('approved', filter)
    api.get(`/products/reviews/?${params}`)
      .then(({ data }) => { setReviews(data.results); setTotal(data.count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filter, page, perPage])

  useEffect(() => { fetchReviews() }, [fetchReviews])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [filter])

  const allIds    = reviews.map(r => r.id)
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id))

  const toggleAll = () => {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(allIds))
  }

  const toggleRow = id => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleApprove = async r => {
    await api.put(`/products/reviews/${r.id}/`, { is_approved: !r.is_approved })
    fetchReviews()
  }

  const remove = async id => {
    if (!confirm('Supprimer cet avis ?')) return
    await api.delete(`/products/reviews/${id}/`)
    fetchReviews()
  }

  const bulkDelete = async () => {
    if (!confirm(`Supprimer ${selected.size} avis ?`)) return
    await Promise.all([...selected].map(id => api.delete(`/products/reviews/${id}/`)))
    setSelected(new Set())
    fetchReviews()
  }

  const totalPages = Math.ceil(total / perPage) || 1
  const pageNums   = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1)

  return (
    <DashboardLayout title="Avis">
      {modal && (
        <AddModal onClose={() => setModal(false)} onSaved={() => { setModal(false); fetchReviews() }} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex gap-1 rounded-lg p-1" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition cursor-pointer ${filter === f.value ? 'bg-violet-600 text-white' : ''}`}
              style={filter === f.value ? undefined : { color: theme.dark.muted }}
            >{f.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button onClick={bulkDelete} className="px-4 py-2 rounded-lg text-sm font-semibold text-red-400 border border-red-800 hover:bg-red-900/20 transition cursor-pointer">
              Supprimer ({selected.size})
            </button>
          )}
          <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 cursor-pointer transition">
            <PlusIcon width={16} height={16} /> Ajouter une nouvelle
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-220">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-violet-600 cursor-pointer" />
              </th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">PRÉNOM</th>
              <th className="px-4 py-3 font-medium">NOM DE FAMILLE</th>
              <th className="px-4 py-3 font-medium">EMAIL</th>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">RATING</th>
              <th className="px-4 py-3 font-medium">DESCRIPTION</th>
              <th className="px-4 py-3 font-medium">CRÉÉ À</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10}><Spinner /></td></tr>
            ) : reviews.length === 0 ? (
              <tr><td colSpan={10}>
                <EmptyState icon={<StarOutlineIcon />} title="Aucun avis trouvé" subtitle="Les avis clients approuvés ou en attente apparaîtront ici." />
              </td></tr>
            ) : reviews.map(r => (
              <tr key={r.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} className="accent-violet-600 cursor-pointer" />
                </td>
                <td className="px-4 py-3 text-gray-500">#{r.id}</td>
                <td className="px-4 py-3 text-gray-200 font-medium">{r.first_name}</td>
                <td className="px-4 py-3 text-gray-300">{r.last_name || '—'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{r.email || '—'}</td>
                <td className="px-4 py-3 text-gray-300 max-w-[120px] truncate">{r.product_name}</td>
                <td className="px-4 py-3"><Stars rating={r.rating} /></td>
                <td className="px-4 py-3 text-gray-400 max-w-[180px] truncate">{r.comment || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(r.created_at).toLocaleDateString('fr-DZ')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-nowrap">
                    {r.is_approved ? (
                      <button onClick={() => toggleApprove(r)} className={theme.badge.warning + ' cursor-pointer hover:opacity-80 transition'}>Désapprouver</button>
                    ) : (
                      <button onClick={() => toggleApprove(r)} className={theme.badge.success + ' cursor-pointer hover:opacity-80 transition'}>Approuver</button>
                    )}
                    <button onClick={() => remove(r.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Supprimer"><TrashIcon /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between mt-4 text-sm" style={{ color: theme.dark.muted }}>
        <p>{selected.size} de {total} sélectionné</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            Lignes par page :
            <Select
              value={perPage}
              onChange={v => { setPerPage(Number(v)); setPage(1) }}
              options={PER_PAGE_OPTIONS.map(n => ({ value: n, label: n }))}
              className="px-2 py-1 rounded-lg border text-gray-300 text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }}
            />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2.5 py-1 rounded text-xs disabled:opacity-30 hover:bg-white/5 transition">←</button>
            {pageNums.map(n => (
              <button key={n} onClick={() => setPage(n)}
                className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${page === n ? 'bg-violet-600 text-white' : ''}`}
                style={page === n ? undefined : { color: theme.dark.muted }}
              >{n}</button>
            ))}
            {totalPages > 5 && page < totalPages && <span className="px-1">…</span>}
            {totalPages > 5 && (
              <button onClick={() => setPage(totalPages)}
                className={`px-2.5 py-1 rounded text-xs transition ${page === totalPages ? 'bg-violet-600 text-white' : ''}`}
                style={page === totalPages ? undefined : { color: theme.dark.muted }}
              >{totalPages}</button>
            )}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-2.5 py-1 rounded text-xs disabled:opacity-30 hover:bg-white/5 transition">→</button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
