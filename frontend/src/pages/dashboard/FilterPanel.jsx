import { useEffect, useRef, useState } from 'react'
import Select from '../../components/Select'
import { WILAYAS } from '../../data/wilayas'
import api from '../../api/axios'
import { theme } from '../../theme'

function FilterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  )
}

const EMPTY_FILTERS = { product: '', category: '', wilaya: '', confirmateur: '', carrier: '', source: '' }

export { EMPTY_FILTERS }

export default function FilterPanel({ filters, setFilters }) {
  const [open, setOpen] = useState(false)
  const [confirmateurs, setConfirmateurs] = useState([])
  const [carriers, setCarriers] = useState([])
  const [sources, setSources] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    api.get('/team/members/?role=confirmateur').then(({ data }) => setConfirmateurs(data)).catch(() => {})
    api.get('/stores/me/carriers/').then(({ data }) => setCarriers(data)).catch(() => {})
    api.get('/orders/stats/sources/?period=month').then(({ data }) => setSources(data.results || [])).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const activeCount = Object.values(filters).filter(Boolean).length
  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }))
  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition cursor-pointer ${activeCount ? 'border-violet-500 text-violet-300' : 'text-app-primary hover:bg-violet-500/5'}`}
        style={activeCount ? undefined : bdrStyle}>
        <FilterIcon /> Filtrage
        {activeCount > 0 && <span className="w-4.5 h-4.5 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center">{activeCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border p-4 shadow-xl z-30"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-app-primary">Filtrage</p>
            {activeCount > 0 && (
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-violet-400 hover:text-violet-300 transition cursor-pointer">
                Réinitialiser
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] mb-1" style={{ color: theme.dark.muted }}>Recherche par produit</label>
              <input value={filters.product} onChange={e => set('product', e.target.value)} placeholder="Nom du produit" className={inputCls} style={bdrStyle} />
            </div>
            <div>
              <label className="block text-[11px] mb-1" style={{ color: theme.dark.muted }}>Recherche par catégorie</label>
              <input value={filters.category} onChange={e => set('category', e.target.value)} placeholder="Nom de la catégorie" className={inputCls} style={bdrStyle} />
            </div>
            <div>
              <label className="block text-[11px] mb-1" style={{ color: theme.dark.muted }}>Wilaya</label>
              <Select value={filters.wilaya} onChange={v => set('wilaya', v)}
                options={[{ value: '', label: 'Choisissez une wilaya' }, ...WILAYAS.map(w => ({ value: w.name, label: w.name }))]}
                className={inputCls} style={{ ...bdrStyle, background: 'transparent' }} />
            </div>
            <div>
              <label className="block text-[11px] mb-1" style={{ color: theme.dark.muted }}>Agent de confirmation</label>
              <Select value={filters.confirmateur} onChange={v => set('confirmateur', v)}
                options={[{ value: '', label: 'Agent de confirmation' }, ...confirmateurs.map(c => ({ value: String(c.id), label: `${c.first_name} ${c.last_name}` }))]}
                className={inputCls} style={{ ...bdrStyle, background: 'transparent' }} />
            </div>
            <div>
              <label className="block text-[11px] mb-1" style={{ color: theme.dark.muted }}>Entreprise de livraison</label>
              <Select value={filters.carrier} onChange={v => set('carrier', v)}
                options={[{ value: '', label: 'Entreprise de livraison' }, ...carriers.map(c => ({ value: String(c.id), label: c.carrier_label }))]}
                className={inputCls} style={{ ...bdrStyle, background: 'transparent' }} />
            </div>
            <div>
              <label className="block text-[11px] mb-1" style={{ color: theme.dark.muted }}>Canal de vente</label>
              <Select value={filters.source} onChange={v => set('source', v)}
                options={[{ value: '', label: 'Tous les canaux de vente' }, ...sources.map(s => ({ value: s.source, label: s.source }))]}
                className={inputCls} style={{ ...bdrStyle, background: 'transparent' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
