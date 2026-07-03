import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
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

function TagIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M20.59 13.41 11 4H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82Z" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
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

function ChevronIcon({ open, ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"
      className={`transition-transform ${open ? 'rotate-90' : ''}`} {...props}>
      <path d="M9 18l6-6-6-6" />
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

const TABS = [
  { label: 'Tous',       value: '' },
  { label: 'Publié',     value: 'publie' },
  { label: 'Désactivé',  value: 'desactive' },
  { label: 'Corbeille',  value: 'corbeille' },
]

const PER_PAGE_OPTS = [10, 25, 50]

function Modal({ cat, parentOptions, onClose, onSaved }) {
  const isEdit = !!cat?.id
  const [form, setForm]   = useState({
    name:      cat?.name      || '',
    parent:    cat?.parent    || '',
    is_active: cat?.is_active ?? true,
  })
  const [image, setImage]   = useState(null)
  const [saving, setSaving] = useState(false)

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition`
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      if (form.parent) fd.append('parent', form.parent)
      fd.append('is_active', form.is_active)
      if (image) fd.append('image', image)
      const opts = { headers: { 'Content-Type': 'multipart/form-data' } }
      if (isEdit) {
        await api.put(`/products/categories/${cat.id}/`, fd, opts)
      } else {
        await api.post('/products/categories/', fd, opts)
      }
      onSaved()
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">{isEdit ? 'Modifier' : 'Nouvelle'} catégorie</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nom *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Nom de la catégorie" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Catégorie parente (optionnel)</label>
            <select value={form.parent} onChange={e => setForm(f => ({ ...f, parent: e.target.value }))} className={inputCls} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
              <option value="">Aucune (catégorie racine)</option>
              {parentOptions.filter(p => p.id !== cat?.id).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Image</label>
            <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} className="text-xs text-gray-400" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-violet-500 cursor-pointer" />
            <label htmlFor="active" className="text-sm text-gray-300">Catégorie active</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition cursor-pointer">Annuler</button>
            <button type="submit" disabled={saving} className={theme.btn.primary + ' text-sm px-5 py-2'}>
              {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CategoriesPage() {
  const [data, setData]         = useState({ results: [], count: 0, page: 1, per_page: 10 })
  const [tab, setTab]           = useState('')
  const [page, setPage]         = useState(1)
  const [perPage, setPerPage]   = useState(10)
  const [expanded, setExpanded] = useState({})
  const [children, setChildren] = useState({})
  const [selected, setSelected] = useState([])
  const [modal, setModal]       = useState(null)
  const [loading, setLoading]   = useState(true)

  const fetchCats = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ parent: 'null', page, per_page: perPage })
    if (tab) params.set('tab', tab)
    api.get(`/products/categories/?${params}`)
      .then(({ data }) => { setData(data); setSelected([]) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tab, page, perPage])

  useEffect(() => { fetchCats() }, [fetchCats])

  const fetchChildren = async (id) => {
    if (children[id]) { setExpanded(e => ({ ...e, [id]: !e[id] })); return }
    const params = new URLSearchParams({ parent: id })
    if (tab) params.set('tab', tab)
    const { data } = await api.get(`/products/categories/?${params}`)
    setChildren(c => ({ ...c, [id]: data.results ?? data }))
    setExpanded(e => ({ ...e, [id]: true }))
  }

  const handleToggle = async (cat) => {
    await api.put(`/products/categories/${cat.id}/`, { is_active: !cat.is_active })
    fetchCats()
    setChildren({})
  }

  const handleDelete = async (id) => {
    const label = tab === 'corbeille' ? 'Supprimer définitivement ?' : 'Mettre en corbeille ?'
    if (!confirm(label)) return
    await api.delete(`/products/categories/${id}/`)
    fetchCats()
    setChildren({})
  }

  const handleRestore = async (id) => {
    await api.post(`/products/categories/${id}/restore/`)
    fetchCats()
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Mettre ${selected.length} catégorie(s) en corbeille ?`)) return
    await Promise.all(selected.map(id => api.delete(`/products/categories/${id}/`)))
    fetchCats()
    setChildren({})
  }

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll    = () => {
    const ids = (data.results || []).map(c => c.id)
    setSelected(s => s.length === ids.length ? [] : ids)
  }

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  const CatRow = ({ cat, indent = false }) => (
    <>
      <div
        className={`flex items-center gap-3 px-4 py-3 border-b hover:bg-white/2 transition ${indent ? 'pl-10' : ''}`}
        style={{ borderColor: theme.dark.border + '44' }}
      >
        {!indent && (
          <input
            type="checkbox"
            checked={selected.includes(cat.id)}
            onChange={() => toggleSelect(cat.id)}
            className="accent-violet-500 cursor-pointer"
          />
        )}

        {cat.image_url
          ? <img src={cat.image_url} alt={cat.name} className="w-9 h-9 object-cover rounded-lg shrink-0" />
          : <div className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 shrink-0" style={{ background: theme.dark.sidebar }}><TagIcon width={16} height={16} /></div>
        }

        {tab !== 'corbeille' && (
          <button
            onClick={() => handleToggle(cat)}
            className={`w-9 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${cat.is_active ? 'bg-violet-600' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${cat.is_active ? 'left-4' : 'left-0.5'}`} />
          </button>
        )}

        <span className="flex-1 text-gray-200 text-sm font-medium">
          {cat.name}
          {cat.children_count > 0 && (
            <span className="ml-2 text-xs" style={{ color: theme.dark.muted }}>
              ( {cat.children_count} Sous-Catégorie{cat.children_count > 1 ? 's' : ''} )
            </span>
          )}
        </span>

        <span className="text-xs" style={{ color: theme.dark.muted }}>
          {new Date(cat.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>

        <div className="flex items-center gap-1">
          {tab === 'corbeille' ? (
            <button onClick={() => handleRestore(cat.id)} className={theme.badge.success + ' cursor-pointer hover:opacity-80 transition'}>
              Restaurer
            </button>
          ) : (
            <>
              {!indent && (
                <button onClick={() => setModal({ parent: cat.id })} className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:bg-white/10 transition cursor-pointer" title="Ajouter une sous-catégorie"><PlusIcon width={14} height={14} /></button>
              )}
              <button onClick={() => setModal(cat)} className="w-7 h-7 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-900/20 transition cursor-pointer" title="Modifier"><EditIcon /></button>
            </>
          )}
          <button onClick={() => handleDelete(cat.id)} className="w-7 h-7 rounded flex items-center justify-center text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Supprimer"><TrashIcon /></button>
          {!indent && cat.children_count > 0 && (
            <button onClick={() => fetchChildren(cat.id)} className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:bg-white/10 transition cursor-pointer">
              <ChevronIcon open={!!expanded[cat.id]} />
            </button>
          )}
        </div>
      </div>
      {expanded[cat.id] && (children[cat.id] || []).map(child => (
        <CatRow key={child.id} cat={child} indent />
      ))}
    </>
  )

  return (
    <DashboardLayout title="Catégories">
      {modal !== null && (
        <Modal
          cat={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchCats(); setChildren({}) }}
          parentOptions={data.results || []}
        />
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <div className="flex gap-1 rounded-lg p-1 overflow-x-auto" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
          {TABS.map(t => (
            <button key={t.value} onClick={() => { setTab(t.value); setPage(1); setChildren({}) }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition cursor-pointer whitespace-nowrap ${tab === t.value ? 'bg-violet-600 text-white' : ''}`}
              style={tab === t.value ? undefined : { color: theme.dark.muted }}
            >{t.label}</button>
          ))}
        </div>
        {tab !== 'corbeille' && (
          <button onClick={() => setModal({})} className={theme.btn.primary + ' text-sm shrink-0'}>
            <PlusIcon width={16} height={16} /> Ajouter une nouvelle
          </button>
        )}
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        {/* Table header with select-all */}
        <div className="flex items-center gap-3 px-4 py-2 border-b text-xs font-semibold min-w-120" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border, color: theme.dark.muted }}>
          <input
            type="checkbox"
            checked={(data.results || []).length > 0 && selected.length === (data.results || []).length}
            onChange={toggleAll}
            className="accent-violet-500 cursor-pointer"
          />
          <span className="flex-1">NOM</span>
          <span className="mr-24">DATE</span>
        </div>

        {loading ? (
          <Spinner />
        ) : (data.results || []).length === 0 ? (
          <EmptyState icon={<TagIcon />} title="Aucune catégorie" subtitle="Créez votre première catégorie pour organiser vos produits." />
        ) : (
          <div className="min-w-120">
            {(data.results || []).map(cat => <CatRow key={cat.id} cat={cat} />)}
          </div>
        )}
      </div>

      {/* Footer pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: theme.dark.muted }}>
          <span>{selected.length} de {data.count} sélectionné{selected.length > 1 ? 's' : ''}</span>
          {selected.length > 0 && tab !== 'corbeille' && (
            <button onClick={handleBulkDelete} className="text-red-400 hover:underline cursor-pointer">Mettre en corbeille</button>
          )}
          <div className="flex items-center gap-2">
            <span>Lignes par page :</span>
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="px-2 py-1 rounded border text-gray-300 text-xs cursor-pointer"
              style={{ background: theme.dark.card, borderColor: theme.dark.border }}
            >
              {PER_PAGE_OPTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed"
          >← Précédent</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
            Math.max(0, page - 3), Math.min(totalPages, page + 2)
          ).map(n => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-8 h-8 rounded text-sm transition cursor-pointer ${n === page ? 'bg-violet-600 text-white' : ''}`}
              style={n === page ? undefined : { color: theme.dark.muted }}
            >{n}</button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed"
          >Suivant →</button>
        </div>
      </div>
    </DashboardLayout>
  )
}
