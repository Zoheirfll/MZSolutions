import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import RichEditor from '../../components/RichEditor'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'

const SECTIONS = ['Détails du produit', 'Description', 'Images', 'Variantes', 'SEO', 'Autres']

const EMPTY = {
  name: '', price: '', compare_price: '', cost_price: '',
  stock: '', sku: '', weight: '', categories: [], supplier: '',
  free_shipping: false, allow_out_of_stock: false, drop_shipping: false,
  offer_enabled: false, offer_quantity: '', offer_price: '',
  specific_shipping_enabled: false, specific_shipping_home_price: '', specific_shipping_desk_price: '',
  dropshipping_price: '', minimum_selling_price: '',
  stock_alert_1: '', stock_alert_2: '', stock_alert_3: '',
  has_position: false, position_range: '', position_stage: '', position_slot: '',
  show_title: true, show_images: true, show_full_price: true, show_discounted_price: true,
  show_countdown: false, countdown_end: '',
  is_active: true, description: '', meta_title: '', meta_description: '',
  meta_keywords: '', meta_robots: '',
}

const EMPTY_OPTION = {
  value: '', price: '', cost_price: '', stock: 0, sku: '',
  allow_out_of_stock: false, is_active: true,
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}

function ImagePlaceholderIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function DragHandleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" {...props}>
      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
    </svg>
  )
}

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function ChevronIcon({ direction = 'down', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"
      style={{ transform: direction === 'up' ? 'rotate(180deg)' : 'none' }} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Construit un arbre { ...category, children: [...] } à partir de la liste
// plate renvoyée par /products/categories/ (chaque item a un champ `parent`).
// La description est stockée en HTML (RichEditor/TipTap) — pour les aperçus
// texte brut (SEO, meta description), on retire les balises.
function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildCategoryTree(flat) {
  if (!Array.isArray(flat)) return []
  const byId = new Map(flat.map(c => [c.id, { ...c, children: [] }]))
  const roots = []
  for (const c of byId.values()) {
    if (c.parent && byId.has(c.parent)) byId.get(c.parent).children.push(c)
    else roots.push(c)
  }
  return roots
}

function CategoryTreeNode({ node, depth, selectedIds, onToggle }) {
  const checked = selectedIds.includes(node.id)
  return (
    <>
      <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-violet-500/5 cursor-pointer" style={{ paddingLeft: 4 + depth * 16 }}>
        <input type="checkbox" checked={checked} onChange={() => onToggle(node.id)} className="accent-violet-500" />
        <span className="text-sm text-app-primary">{node.name}</span>
      </label>
      {node.children.map(child => (
        <CategoryTreeNode key={child.id} node={child} depth={depth + 1} selectedIds={selectedIds} onToggle={onToggle} />
      ))}
    </>
  )
}

function Toggle({ label, value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-colors relative shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${value ? 'bg-violet-600' : 'bg-(--border-color-hover)'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
      {label && <span className="text-sm text-app-primary">{label}</span>}
    </div>
  )
}

function VariantBlock({ productId, variant, onDeleted, onUpdated, stockBatchId }) {
  const [expanded, setExpanded] = useState(true)
  const [name, setName]         = useState(variant.name)
  const [subName, setSubName]   = useState(variant.sub_option_name || '')
  const [options, setOptions]   = useState(variant.options || [])
  const [saving, setSaving]     = useState(false)
  const optImgRefs              = useRef({})

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
  const bdrStyle = { borderColor: theme.dark.border }

  const saveVariant = async () => {
    setSaving(true)
    try {
      await api.put(`/products/${productId}/variants/${variant.id}/`, {
        name, sub_option_name: subName,
      })
      onUpdated && onUpdated()
    } catch {} finally { setSaving(false) }
  }

  const deleteVariant = async () => {
    if (!confirm('Supprimer cette variante ?')) return
    await api.delete(`/products/${productId}/variants/${variant.id}/`)
    onDeleted()
  }

  const addOption = async () => {
    try {
      const { data } = await api.post(`/products/${productId}/variants/${variant.id}/options/`, { ...EMPTY_OPTION, value: 'Nouvelle option' })
      setOptions(o => [...o, data])
    } catch {}
  }

  const updateOption = async (oid, patch) => {
    setOptions(o => o.map(opt => opt.id === oid ? { ...opt, ...patch } : opt))
  }

  const saveOption = async (opt) => {
    try {
      await api.put(`/products/${productId}/variants/${variant.id}/options/${opt.id}/`, {
        value:              opt.value,
        price:              opt.price || null,
        cost_price:         opt.cost_price || null,
        stock:              opt.stock,
        sku:                opt.sku,
        allow_out_of_stock: opt.allow_out_of_stock,
        is_active:          opt.is_active,
      }, { headers: { 'X-Stock-Batch-Id': stockBatchId } })
    } catch {}
  }

  const uploadOptionImage = async (opt, file) => {
    const fd = new FormData()
    fd.append('image', file)
    const { data } = await api.put(
      `/products/${productId}/variants/${variant.id}/options/${opt.id}/`,
      fd, { headers: { 'Content-Type': 'multipart/form-data', 'X-Stock-Batch-Id': stockBatchId } }
    )
    setOptions(o => o.map(x => x.id === opt.id ? data : x))
  }

  const deleteOption = async (oid) => {
    await api.delete(`/products/${productId}/variants/${variant.id}/options/${oid}/`)
    setOptions(o => o.filter(x => x.id !== oid))
  }

  // 2e niveau de variante (ex: pointures 41/42/43 sous l'option "Noir") —
  // n'a de sens que si le vendeur a nommé ce 2e niveau (variant.sub_option_name).
  const addSubOption = async (opt) => {
    try {
      const { data } = await api.post(
        `/products/${productId}/variants/${variant.id}/options/${opt.id}/sub-options/`,
        { value: 'Nouvelle valeur', stock: 0 },
      )
      setOptions(o => o.map(x => x.id === opt.id ? { ...x, sub_options: [...(x.sub_options || []), data] } : x))
    } catch {}
  }

  const updateSubOption = (optId, subId, patch) => {
    setOptions(o => o.map(x => x.id === optId
      ? { ...x, sub_options: (x.sub_options || []).map(s => s.id === subId ? { ...s, ...patch } : s) }
      : x))
  }

  const saveSubOption = async (optId, sub) => {
    try {
      await api.put(`/products/${productId}/variants/${variant.id}/options/${optId}/sub-options/${sub.id}/`, {
        value: sub.value,
        price: sub.price || null,
        cost_price: sub.cost_price || null,
        stock: sub.stock,
        sku: sub.sku,
        dropshipping_price: sub.dropshipping_price || null,
        minimum_selling_price: sub.minimum_selling_price || null,
        allow_out_of_stock: sub.allow_out_of_stock,
        is_active: sub.is_active,
      }, { headers: { 'X-Stock-Batch-Id': stockBatchId } })
    } catch {}
  }

  const deleteSubOption = async (optId, subId) => {
    await api.delete(`/products/${productId}/variants/${variant.id}/options/${optId}/sub-options/${subId}/`)
    setOptions(o => o.map(x => x.id === optId ? { ...x, sub_options: (x.sub_options || []).filter(s => s.id !== subId) } : x))
  }

  return (
    <div className="rounded-xl border mb-3 overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      {/* Header variante */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: theme.dark.border }}>
        <DragHandleIcon className="text-app-muted cursor-grab shrink-0" />
        <div className="flex-1 flex items-center gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={saveVariant}
            placeholder="Nom de la variante (ex: Couleur)"
            className="flex-1 px-2 py-1 rounded text-sm text-app-primary bg-transparent border-b outline-none focus:border-violet-500 transition"
            style={{ borderColor: theme.dark.border }}
          />
          <input
            value={subName}
            onChange={e => setSubName(e.target.value)}
            onBlur={saveVariant}
            placeholder="Nom des sous-options (ex: Taille)"
            className="flex-1 px-2 py-1 rounded text-sm text-app-primary bg-transparent border-b outline-none focus:border-violet-500 transition"
            style={{ borderColor: theme.dark.border }}
          />
        </div>
        <button onClick={deleteVariant} className="w-8 h-8 flex items-center justify-center rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition"><TrashIcon /></button>
        <button onClick={() => setExpanded(e => !e)} className="w-8 h-8 flex items-center justify-center rounded text-app-muted-light hover:bg-violet-500/10 transition">
          {expanded ? '▾' : '▸'}
        </button>
      </div>

      {/* Options */}
      {expanded && (
        <div className="p-4 space-y-3">
          {options.map((opt, idx) => (
            <div key={opt.id} className="rounded-lg border p-4 space-y-3" style={{ borderColor: theme.dark.border }}>
              {/* Option header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Toggle value={opt.is_active} onChange={v => { updateOption(opt.id, { is_active: v }); saveOption({ ...opt, is_active: v }) }} />
                  <span className="text-sm text-app-muted-light font-medium">Option {idx + 1}</span>
                </div>
                <button onClick={() => deleteOption(opt.id)} className="w-7 h-7 flex items-center justify-center rounded bg-red-600/15 text-red-400 hover:bg-red-600/30 transition"><TrashIcon /></button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Left — champs */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1">Valeur de l'option</label>
                    <input
                      value={opt.value}
                      onChange={e => updateOption(opt.id, { value: e.target.value })}
                      onBlur={() => saveOption(opt)}
                      className={inputCls} style={bdrStyle}
                      placeholder="ex: Rouge"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1">Stock de l'option</label>
                    <input
                      type="number" min="0"
                      value={opt.stock}
                      onChange={e => updateOption(opt.id, { stock: Number(e.target.value) })}
                      onBlur={() => saveOption(opt)}
                      className={inputCls} style={bdrStyle}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-app-muted-light mb-1">Prix de l'option <span className="text-app-muted">DZD</span></label>
                      <input
                        type="number" min="0" step="0.01"
                        value={opt.price || ''}
                        onChange={e => updateOption(opt.id, { price: e.target.value })}
                        onBlur={() => saveOption(opt)}
                        className={inputCls} style={bdrStyle}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-app-muted-light mb-1">Prix d'achat <span className="text-app-muted">DZD</span></label>
                      <input
                        type="number" min="0" step="0.01"
                        value={opt.cost_price || ''}
                        onChange={e => updateOption(opt.id, { cost_price: e.target.value })}
                        onBlur={() => saveOption(opt)}
                        className={inputCls} style={bdrStyle}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1">SKU</label>
                    <input
                      value={opt.sku}
                      onChange={e => updateOption(opt.id, { sku: e.target.value })}
                      onBlur={() => saveOption(opt)}
                      className={inputCls} style={bdrStyle}
                      placeholder="sku"
                    />
                  </div>
                  <Toggle
                    label="Permettre aux utilisateurs d'effectuer des achats même si l'article est en rupture de stock."
                    value={opt.allow_out_of_stock}
                    onChange={v => { updateOption(opt.id, { allow_out_of_stock: v }); saveOption({ ...opt, allow_out_of_stock: v }) }}
                  />
                </div>

                {/* Right — image */}
                <div>
                  <input
                    type="file" accept="image/*"
                    ref={el => { optImgRefs.current[opt.id] = el }}
                    className="hidden"
                    onChange={e => e.target.files[0] && uploadOptionImage(opt, e.target.files[0])}
                  />
                  {opt.image_url ? (
                    <div className="relative group">
                      <img src={opt.image_url} alt={opt.value} className="w-full aspect-square object-cover rounded-xl" />
                      <button
                        type="button"
                        onClick={() => optImgRefs.current[opt.id]?.click()}
                        className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition text-white text-sm"
                      >Changer</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => optImgRefs.current[opt.id]?.click()}
                      className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 transition aspect-square"
                      style={{ borderColor: theme.dark.border }}
                    >
                      <ImagePlaceholderIcon className="text-app-muted mb-2" />
                      <span className="text-xs text-app-muted text-center px-2">Drag and drop or <span className="text-violet-400">browse</span> to upload</span>
                      <span className="text-xs mt-1" style={{ color: theme.dark.muted }}>PNG, JPG, GIF up to 5MB each</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sous-variantes (2e niveau, ex: pointures 41/42/43 sous "Noir") */}
              {subName.trim() && (
                <div className="border-t pt-3 mt-1" style={{ borderColor: theme.dark.border }}>
                  <p className="text-xs font-medium text-app-muted-light mb-2">{subName} de "{opt.value}"</p>
                  <div className="space-y-2">
                    {(opt.sub_options || []).map(sub => (
                      <div key={sub.id} className="grid grid-cols-6 gap-2 items-end rounded-lg border p-2.5" style={{ borderColor: theme.dark.border }}>
                        <div className="col-span-1">
                          <label className="block text-[10px] text-app-muted mb-0.5">Valeur</label>
                          <input value={sub.value} onChange={e => updateSubOption(opt.id, sub.id, { value: e.target.value })}
                            onBlur={() => saveSubOption(opt.id, sub)} className={`${inputCls} text-xs px-2 py-1.5`} style={bdrStyle} />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-[10px] text-app-muted mb-0.5">Stock</label>
                          <input type="number" min="0" value={sub.stock} onChange={e => updateSubOption(opt.id, sub.id, { stock: Number(e.target.value) })}
                            onBlur={() => saveSubOption(opt.id, sub)} className={`${inputCls} text-xs px-2 py-1.5`} style={bdrStyle} />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-[10px] text-app-muted mb-0.5">Prix</label>
                          <input type="number" min="0" step="0.01" value={sub.price || ''} placeholder="—" onChange={e => updateSubOption(opt.id, sub.id, { price: e.target.value })}
                            onBlur={() => saveSubOption(opt.id, sub)} className={`${inputCls} text-xs px-2 py-1.5`} style={bdrStyle} />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-[10px] text-app-muted mb-0.5">Prix drop</label>
                          <input type="number" min="0" step="0.01" value={sub.dropshipping_price || ''} placeholder="—" onChange={e => updateSubOption(opt.id, sub.id, { dropshipping_price: e.target.value })}
                            onBlur={() => saveSubOption(opt.id, sub)} className={`${inputCls} text-xs px-2 py-1.5`} style={bdrStyle} />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-[10px] text-app-muted mb-0.5">Min. vente drop</label>
                          <input type="number" min="0" step="0.01" value={sub.minimum_selling_price || ''} placeholder="—" onChange={e => updateSubOption(opt.id, sub.id, { minimum_selling_price: e.target.value })}
                            onBlur={() => saveSubOption(opt.id, sub)} className={`${inputCls} text-xs px-2 py-1.5`} style={bdrStyle} />
                        </div>
                        <div className="col-span-1 flex items-center justify-between gap-1">
                          <Toggle value={sub.allow_out_of_stock} onChange={v => { updateSubOption(opt.id, sub.id, { allow_out_of_stock: v }); saveSubOption(opt.id, { ...sub, allow_out_of_stock: v }) }} />
                          <button onClick={() => deleteSubOption(opt.id, sub.id)} className="w-6 h-6 shrink-0 flex items-center justify-center rounded bg-red-600/15 text-red-400 hover:bg-red-600/30 transition"><TrashIcon /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addSubOption(opt)}
                    className="w-full mt-2 py-1.5 rounded-lg border border-dashed text-xs text-violet-400 hover:border-violet-500 hover:bg-violet-600/5 transition"
                    style={{ borderColor: theme.dark.border }}
                  >
                    + Ajouter {subName || 'une sous-variante'}
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addOption}
            className="w-full py-2 rounded-lg border-2 border-dashed text-sm text-violet-400 hover:border-violet-500 hover:bg-violet-600/5 transition"
            style={{ borderColor: theme.dark.border }}
          >
            + Ajouter une option
          </button>
        </div>
      )}
    </div>
  )
}

let draftIdCounter = 0
const nextDraftId = () => `draft-${++draftIdCounter}`

const EMPTY_DRAFT_OPTION = () => ({
  tempId: nextDraftId(), value: '', price: '', cost_price: '', stock: 0, sku: '',
  allow_out_of_stock: false, is_active: true,
})

// Miroir de VariantBlock, mais purement local (aucun appel API) — utilisé
// tant que le produit n'existe pas encore. Les variantes/options ne sont
// réellement créées côté serveur qu'à l'enregistrement du produit (voir
// handleSave), pour ne plus jamais exiger un premier "Enregistrer" avant de
// pouvoir remplir les variantes (incohérence relevée par l'utilisateur).
function DraftVariantBlock({ variant, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(true)
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
  const bdrStyle = { borderColor: theme.dark.border }

  const patch = (fields) => onChange({ ...variant, ...fields })
  const addOption = () => patch({ options: [...variant.options, EMPTY_DRAFT_OPTION()] })
  const updateOption = (tempId, fields) => patch({
    options: variant.options.map(o => o.tempId === tempId ? { ...o, ...fields } : o),
  })
  const deleteOption = (tempId) => patch({ options: variant.options.filter(o => o.tempId !== tempId) })

  return (
    <div className="rounded-xl border mb-3 overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: theme.dark.border }}>
        <DragHandleIcon className="text-app-muted cursor-grab shrink-0" />
        <div className="flex-1 flex items-center gap-3">
          <input
            value={variant.name}
            onChange={e => patch({ name: e.target.value })}
            placeholder="Nom de la variante (ex: Couleur)"
            className="flex-1 px-2 py-1 rounded text-sm text-app-primary bg-transparent border-b outline-none focus:border-violet-500 transition"
            style={{ borderColor: theme.dark.border }}
          />
          <input
            value={variant.sub_option_name}
            onChange={e => patch({ sub_option_name: e.target.value })}
            placeholder="Nom des sous-options (ex: Taille)"
            className="flex-1 px-2 py-1 rounded text-sm text-app-primary bg-transparent border-b outline-none focus:border-violet-500 transition"
            style={{ borderColor: theme.dark.border }}
          />
        </div>
        <button type="button" onClick={onDelete} className="w-8 h-8 flex items-center justify-center rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition"><TrashIcon /></button>
        <button type="button" onClick={() => setExpanded(e => !e)} className="w-8 h-8 flex items-center justify-center rounded text-app-muted-light hover:bg-violet-500/10 transition">
          <ChevronIcon direction={expanded ? 'up' : 'down'} />
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          {variant.options.map((opt, idx) => (
            <div key={opt.tempId} className="rounded-lg border p-4 space-y-3" style={{ borderColor: theme.dark.border }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Toggle value={opt.is_active} onChange={v => updateOption(opt.tempId, { is_active: v })} />
                  <span className="text-sm text-app-muted-light font-medium">Option {idx + 1}</span>
                </div>
                <button type="button" onClick={() => deleteOption(opt.tempId)} className="w-7 h-7 flex items-center justify-center rounded bg-red-600/15 text-red-400 hover:bg-red-600/30 transition"><TrashIcon /></button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-app-muted-light mb-1">Valeur de l'option</label>
                  <input value={opt.value} onChange={e => updateOption(opt.tempId, { value: e.target.value })} className={inputCls} style={bdrStyle} placeholder="ex: Rouge" />
                </div>
                <div>
                  <label className="block text-xs text-app-muted-light mb-1">Stock de l'option</label>
                  <input type="number" min="0" value={opt.stock} onChange={e => updateOption(opt.tempId, { stock: Number(e.target.value) })} className={inputCls} style={bdrStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-app-muted-light mb-1">Prix de l'option <span className="text-app-muted">DZD</span></label>
                  <input type="number" min="0" step="0.01" value={opt.price} onChange={e => updateOption(opt.tempId, { price: e.target.value })} className={inputCls} style={bdrStyle} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-app-muted-light mb-1">Prix d'achat <span className="text-app-muted">DZD</span></label>
                  <input type="number" min="0" step="0.01" value={opt.cost_price} onChange={e => updateOption(opt.tempId, { cost_price: e.target.value })} className={inputCls} style={bdrStyle} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-app-muted-light mb-1">SKU</label>
                <input value={opt.sku} onChange={e => updateOption(opt.tempId, { sku: e.target.value })} className={inputCls} style={bdrStyle} placeholder="sku" />
              </div>
              <Toggle
                label="Permettre aux utilisateurs d'effectuer des achats même si l'article est en rupture de stock."
                value={opt.allow_out_of_stock}
                onChange={v => updateOption(opt.tempId, { allow_out_of_stock: v })}
              />
              <p className="text-xs" style={{ color: theme.dark.muted }}>L'image de cette option pourra être ajoutée après l'enregistrement du produit.</p>
            </div>
          ))}

          <button
            type="button"
            onClick={addOption}
            className="w-full py-2 rounded-lg border-2 border-dashed text-sm text-violet-400 hover:border-violet-500 hover:bg-violet-600/5 transition"
            style={{ borderColor: theme.dark.border }}
          >
            + Ajouter une sous-option
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProductFormPage() {
  const { id }  = useParams()
  const isEdit  = !!id
  const navigate = useNavigate()
  const { user } = useAuth()
  // Un seul identifiant de lot pour toute la session d'édition — regroupe les
  // mouvements de stock de plusieurs variantes modifiées pendant cette visite
  // en une seule ligne dans "Mouvement des stocks" (voir StockMovementListView).
  const stockBatchId = useRef(crypto.randomUUID()).current

  const [section, setSection]       = useState(SECTIONS[0])
  const sectionIndex = SECTIONS.indexOf(section)
  const [form, setForm]             = useState(EMPTY)
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers]   = useState([])
  const [images, setImages]         = useState([])
  const [pendingImages, setPendingImages] = useState([]) // création : fichiers choisis avant l'existence du produit
  const [variants, setVariants]     = useState([])
  const [pendingVariants, setPendingVariants] = useState([]) // création : variantes/options en brouillon
  const [saving, setSaving]         = useState(false)
  const [errors, setErrors]         = useState({})
  const [ogImageUrl, setOgImageUrl]           = useState(null)
  const [twitterImageUrl, setTwitterImageUrl] = useState(null)
  const fileRef = useRef()
  const ogImageRef = useRef()
  const twitterImageRef = useRef()

  const pendingImagesRef = useRef(pendingImages)
  pendingImagesRef.current = pendingImages
  useEffect(() => () => { pendingImagesRef.current.forEach(p => URL.revokeObjectURL(p.previewUrl)) }, [])

  useEffect(() => {
    api.get('/products/categories/?per_page=500').then(({ data }) => {
      const list = data.results ?? data
      setCategories(Array.isArray(list) ? list : [])
    }).catch(() => {})
    api.get('/products/suppliers/').then(({ data }) => setSuppliers(data)).catch(() => {})
    if (isEdit) {
      api.get(`/products/${id}/`).then(({ data }) => {
        setForm({
          name: data.name, price: data.price, compare_price: data.compare_price ?? '',
          cost_price: data.cost_price ?? '', stock: data.stock, sku: data.sku ?? '',
          weight: data.weight ?? '', categories: (data.categories || []).map(Number), supplier: data.supplier ?? '',
          free_shipping: data.free_shipping, allow_out_of_stock: data.allow_out_of_stock,
          drop_shipping: data.drop_shipping, is_active: data.is_active,
          offer_enabled: data.offer_enabled, offer_quantity: data.offer_quantity ?? '', offer_price: data.offer_price ?? '',
          specific_shipping_enabled: data.specific_shipping_enabled,
          specific_shipping_home_price: data.specific_shipping_home_price ?? '',
          specific_shipping_desk_price: data.specific_shipping_desk_price ?? '',
          dropshipping_price: data.dropshipping_price ?? '', minimum_selling_price: data.minimum_selling_price ?? '',
          stock_alert_1: data.stock_alert_1 ?? '', stock_alert_2: data.stock_alert_2 ?? '', stock_alert_3: data.stock_alert_3 ?? '',
          has_position: data.has_position, position_range: data.position_range || '',
          position_stage: data.position_stage || '', position_slot: data.position_slot || '',
          show_title: data.show_title, show_images: data.show_images,
          show_full_price: data.show_full_price, show_discounted_price: data.show_discounted_price,
          show_countdown: data.show_countdown, countdown_end: data.countdown_end ? data.countdown_end.slice(0, 16) : '',
          description: data.description,
          meta_title: data.meta_title || '', meta_description: data.meta_description || '',
          meta_keywords: data.meta_keywords || '', meta_robots: data.meta_robots || '',
        })
        setOgImageUrl(data.og_image_url || null)
        setTwitterImageUrl(data.twitter_image_url || null)
        setImages(data.images || [])
        setVariants(data.variants || [])
      }).catch(() => {})
    }
  }, [id, isEdit])

  const change = e => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const activeVariants = isEdit ? variants : pendingVariants
  const hasVariants = activeVariants.some(v => (v.options || []).length > 0)
  const totalStock = activeVariants.reduce((sum, v) => sum + (v.options || []).reduce((s, o) => s + (Number(o.stock) || 0), 0), 0)

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories])
  const toggleCategory = (catId) => setForm(f => ({
    ...f,
    categories: f.categories.includes(catId)
      ? f.categories.filter(id => id !== catId)
      : [...f.categories, catId],
  }))

  // Upload séquentiel utilisé aussi bien en édition (id existant) qu'en
  // création juste après la réponse de POST /products/ (voir handleSave).
  const uploadImagesFor = async (productId, files) => {
    for (const file of files) {
      const fd = new FormData()
      fd.append('image', file)
      await api.post(`/products/${productId}/images/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    }
  }

  // Images SEO (Open Graph/Twitter) — upload immédiat comme les images de
  // variante, uniquement disponible en édition (le produit doit déjà exister).
  const uploadSeoImage = async (field, file) => {
    const fd = new FormData()
    fd.append(field, file)
    const { data } = await api.put(`/products/${id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (field === 'og_image') setOgImageUrl(data.og_image_url)
    else setTwitterImageUrl(data.twitter_image_url)
  }

  // Idem pour les variantes/options en brouillon — créées réellement une
  // fois le produit existant, dans l'ordre où l'utilisateur les a saisies.
  const createVariantsFor = async (productId, draftVariants) => {
    for (let order = 0; order < draftVariants.length; order++) {
      const v = draftVariants[order]
      const { data: created } = await api.post(`/products/${productId}/variants/`, {
        name: v.name, sub_option_name: v.sub_option_name, order,
      })
      for (const opt of v.options) {
        await api.post(`/products/${productId}/variants/${created.id}/options/`, {
          value: opt.value, price: opt.price || null, cost_price: opt.cost_price || null,
          stock: opt.stock, sku: opt.sku, allow_out_of_stock: opt.allow_out_of_stock, is_active: opt.is_active,
        })
      }
    }
  }

  const handleSave = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    const payload = {
      ...form,
      price:         form.price       || null,
      compare_price: form.compare_price || null,
      cost_price:    form.cost_price   || null,
      weight:        form.weight       || null,
      categories:    form.categories,
      supplier:      form.supplier     || null,
      offer_quantity: form.offer_quantity || null,
      offer_price:    form.offer_price    || null,
      specific_shipping_home_price: form.specific_shipping_home_price || null,
      specific_shipping_desk_price: form.specific_shipping_desk_price || null,
      dropshipping_price:    form.dropshipping_price    || null,
      minimum_selling_price: form.minimum_selling_price || null,
      stock_alert_1: form.stock_alert_1 || null,
      stock_alert_2: form.stock_alert_2 || null,
      stock_alert_3: form.stock_alert_3 || null,
      countdown_end: form.countdown_end ? new Date(form.countdown_end).toISOString() : null,
    }
    try {
      if (isEdit) {
        await api.put(`/products/${id}/`, payload, { headers: { 'X-Stock-Batch-Id': stockBatchId } })
        navigate('/dashboard/produits')
      } else {
        const { data } = await api.post('/products/', payload)
        if (pendingImages.length) await uploadImagesFor(data.id, pendingImages.map(p => p.file))
        if (pendingVariants.length) await createVariantsFor(data.id, pendingVariants)
        navigate(`/dashboard/produits/${data.id}/modifier`)
      }
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = async (files) => {
    if (!isEdit) {
      setPendingImages(prev => [...prev, ...files.map(file => ({ tempId: nextDraftId(), file, previewUrl: URL.createObjectURL(file) }))])
      return
    }
    for (const file of files) {
      const fd = new FormData()
      fd.append('image', file)
      const { data } = await api.post(`/products/${id}/images/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImages(imgs => [...imgs, data])
    }
  }

  const removePendingImage = (tempId) => setPendingImages(prev => {
    const found = prev.find(p => p.tempId === tempId)
    if (found) URL.revokeObjectURL(found.previewUrl)
    return prev.filter(p => p.tempId !== tempId)
  })

  const handleDeleteImage = async (imgId) => {
    await api.delete(`/products/${id}/images/${imgId}/`)
    setImages(imgs => imgs.filter(i => i.id !== imgId))
  }

  const moveImage = async (index, direction) => {
    const next = [...images]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setImages(next)
    try {
      await api.put(`/products/${id}/images/reorder/`, { order: next.map(img => img.id) })
    } catch {}
  }

  const addVariant = () => {
    if (!isEdit) {
      setPendingVariants(v => [...v, { tempId: nextDraftId(), name: '', sub_option_name: '', options: [] }])
      return
    }
    api.post(`/products/${id}/variants/`, { name: 'Nouvelle variante', order: variants.length })
      .then(({ data }) => setVariants(v => [...v, { ...data, options: [] }]))
  }

  const updatePendingVariant = (tempId, updated) => setPendingVariants(v => v.map(x => x.tempId === tempId ? updated : x))
  const deletePendingVariant = (tempId) => setPendingVariants(v => v.filter(x => x.tempId !== tempId))

  const reloadVariants = async () => {
    if (!isEdit) return
    const { data } = await api.get(`/products/${id}/variants/`)
    setVariants(data)
  }

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title={isEdit ? 'Modifier le produit' : 'Ajouter un produit'} subtitle="C'est ici que vous créez ou modifiez un produit de votre catalogue : son nom, sa description, son prix, ses photos, et ses catégories. Si votre produit existe en plusieurs versions (par exemple différentes couleurs ou tailles), ajoutez des variantes — chacune peut avoir son propre prix, stock et image. La section SEO tout en bas contrôle comment ce produit apparaît dans les résultats de recherche Google.">
      <div className="flex gap-5 h-full">

        {/* Section nav gauche */}
        <div className="w-48 shrink-0">
          <div className="rounded-xl border overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            {SECTIONS.map(s => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`w-full text-left px-4 py-3 text-sm border-b transition ${
                  section === s ? 'text-violet-300 bg-violet-600/10' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                }`}
                style={{ borderColor: theme.dark.border }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1">
          <form onSubmit={handleSave}>

            {Object.keys(errors).length > 0 && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-4 mb-4 text-sm text-red-400 space-y-1">
                <p className="font-semibold">La sauvegarde a échoué :</p>
                {Object.entries(errors).map(([field, msg]) => (
                  <p key={field}>{Array.isArray(msg) ? msg.join(' ') : String(msg)}</p>
                ))}
              </div>
            )}

            {/* ── Détails du produit ── */}
            {section === 'Détails du produit' && (
              <div className="rounded-xl border p-6 space-y-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs text-app-muted-light mb-1.5">Nom *</label>
                    <input name="name" value={form.name} onChange={change} required className={inputCls} style={bdrStyle} placeholder="Nom du produit" />
                    {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Catégories</label>
                    <div className="rounded-lg border p-2 max-h-32 overflow-y-auto space-y-0.5" style={{ borderColor: theme.dark.border }}>
                      {categories.length === 0 && <p className="text-xs text-app-muted px-1">Aucune catégorie</p>}
                      {categoryTree.map(node => (
                        <CategoryTreeNode
                          key={node.id}
                          node={node}
                          depth={0}
                          selectedIds={form.categories}
                          onToggle={toggleCategory}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Stock</label>
                    <input
                      name="stock" type="number" min="0"
                      value={hasVariants ? totalStock : form.stock} onChange={change}
                      readOnly={hasVariants} className={inputCls} style={bdrStyle} placeholder="0"
                    />
                    {hasVariants && (
                      <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>
                        Stock final calculé à partir des variantes (onglet "Variantes").
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Prix de vente * <span className="text-app-muted">DZD</span></label>
                    <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={change} required className={inputCls} style={bdrStyle} placeholder="0" />
                    {errors.price && <p className="text-red-400 text-xs mt-1">{errors.price}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Prix hors remise <span className="text-app-muted">DZD</span></label>
                    <input name="compare_price" type="number" min="0" step="0.01" value={form.compare_price} onChange={change} className={inputCls} style={bdrStyle} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Prix d'achat <span className="text-app-muted">DZD</span></label>
                    <input name="cost_price" type="number" min="0" step="0.01" value={form.cost_price} onChange={change} className={inputCls} style={bdrStyle} placeholder="0" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">SKU</label>
                    <input name="sku" value={form.sku} onChange={change} className={inputCls} style={bdrStyle} placeholder="Référence produit" />
                    {errors.sku && <p className="text-red-400 text-xs mt-1">{errors.sku}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Poids <span className="text-app-muted">Kg</span></label>
                    <input name="weight" type="number" min="0" step="0.01" value={form.weight} onChange={change} className={inputCls} style={bdrStyle} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Fournisseur</label>
                    <Select
                      value={form.supplier}
                      onChange={v => setForm(f => ({ ...f, supplier: v }))}
                      options={suppliers.map(s => ({ value: s.id, label: `${s.first_name} ${s.last_name}` }))}
                      placeholder="Aucun fournisseur"
                      className={inputCls}
                      style={{ ...bdrStyle, background: theme.dark.sidebar }}
                    />
                  </div>
                </div>

                <div className="border-t pt-4 grid grid-cols-2 gap-x-8" style={{ borderColor: theme.dark.border }}>
                  {[
                    ['Livraison gratuite', 'free_shipping'],
                    ['Autoriser achats en rupture de stock', 'allow_out_of_stock', hasVariants],
                    ['Drop Shipping', 'drop_shipping'],
                    ['Produit actif', 'is_active'],
                  ].map(([label, name, disabled]) => (
                    <div key={name} className="flex items-center justify-between py-2">
                      <span className="text-sm text-app-primary">{label}</span>
                      <Toggle value={form[name]} onChange={v => setForm(f => ({ ...f, [name]: v }))} disabled={disabled} />
                    </div>
                  ))}
                </div>
                {form.free_shipping && (
                  <p className="text-xs" style={{ color: theme.dark.muted }}>
                    Ce produit sera toujours en livraison gratuite, quelle que soit la wilaya ou le transporteur.
                  </p>
                )}
                {hasVariants && (
                  <p className="text-xs" style={{ color: theme.dark.muted }}>
                    Ce produit a des variantes — la rupture de stock se gère par option dans l'onglet "Variantes" (ce réglage global n'a aucun effet tant qu'il y a des variantes).
                  </p>
                )}

                {/* Offre disponible (palier de quantité) */}
                <div className="border-t pt-4" style={{ borderColor: theme.dark.border }}>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-sm text-app-primary">Offre disponible</span>
                      <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>Prix total fixe à partir d'une certaine quantité (ex : 2 pour 2500 DZD au lieu de 3000 DZD)</p>
                    </div>
                    <Toggle value={form.offer_enabled} onChange={v => setForm(f => ({ ...f, offer_enabled: v }))} />
                  </div>
                  {form.offer_enabled && (
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Quantité du palier</label>
                        <input type="number" min="2" value={form.offer_quantity} onChange={e => setForm(f => ({ ...f, offer_quantity: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="2" />
                      </div>
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Prix total du palier <span className="text-app-muted">DZD</span></label>
                        <input type="number" min="0" step="0.01" value={form.offer_price} onChange={e => setForm(f => ({ ...f, offer_price: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="2500" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Prix de livraison spécifique */}
                <div className="border-t pt-4" style={{ borderColor: theme.dark.border }}>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-sm text-app-primary">Prix de livraison spécifique</span>
                      <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>Remplace le tarif de livraison habituel (grille wilaya/transporteur) pour ce produit précis</p>
                    </div>
                    <Toggle value={form.specific_shipping_enabled} onChange={v => setForm(f => ({ ...f, specific_shipping_enabled: v }))} />
                  </div>
                  {form.specific_shipping_enabled && (
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Livraison à domicile <span className="text-app-muted">DZD</span></label>
                        <input type="number" min="0" step="0.01" value={form.specific_shipping_home_price} onChange={e => setForm(f => ({ ...f, specific_shipping_home_price: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Livraison en point relais <span className="text-app-muted">DZD</span></label>
                        <input type="number" min="0" step="0.01" value={form.specific_shipping_desk_price} onChange={e => setForm(f => ({ ...f, specific_shipping_desk_price: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Dropshipping — prix coûtant / prix minimum de vente */}
                {form.drop_shipping && (
                  <div className="border-t pt-4" style={{ borderColor: theme.dark.border }}>
                    <span className="text-sm text-app-primary">Tarification dropshipping</span>
                    <p className="text-xs mt-0.5 mb-2" style={{ color: theme.dark.muted }}>Le dropshipper choisit son propre prix de vente (au moins le minimum) — sa marge = prix de vente choisi moins le prix coûtant.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Prix coûtant (dropshipper) <span className="text-app-muted">DZD</span></label>
                        <input type="number" min="0" step="0.01" value={form.dropshipping_price} onChange={e => setForm(f => ({ ...f, dropshipping_price: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Prix minimum de vente <span className="text-app-muted">DZD</span></label>
                        <input type="number" min="0" step="0.01" value={form.minimum_selling_price} onChange={e => setForm(f => ({ ...f, minimum_selling_price: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="0" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Description ── */}
            {section === 'Description' && (
              <div className="rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <label className="block text-xs text-app-muted-light mb-2">Description du produit</label>
                <RichEditor
                  value={form.description}
                  onChange={html => setForm(f => ({ ...f, description: html }))}
                  placeholder="Décrivez votre produit…"
                />
              </div>
            )}

            {/* ── Images ── */}
            {section === 'Images' && (
              <div className="rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => handleImageUpload(Array.from(e.target.files))} />

                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleImageUpload(Array.from(e.dataTransfer.files)) }}
                  className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition hover:border-violet-500"
                  style={{ borderColor: theme.dark.border }}
                >
                  <ImagePlaceholderIcon className="mx-auto mb-3 text-app-muted" width={36} height={36} />
                  <p className="text-app-muted-light text-sm">Glissez-déposez ou cliquez pour uploader</p>
                  <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>PNG, JPG, GIF — max 5MB chacun</p>
                  {!isEdit && <p className="text-xs mt-2" style={{ color: theme.dark.muted }}>Envoyées à l'enregistrement du produit</p>}
                </div>

                {(images.length > 0 || pendingImages.length > 0) && (
                  <div className="grid grid-cols-5 gap-3 mt-5">
                    {images.map((img, idx) => (
                      <div key={img.id} className="relative group">
                        <img src={img.image_url} alt="" className="w-full aspect-square object-cover rounded-lg" />
                        {idx === 0 && (
                          <span className={theme.badge.info + ' absolute bottom-1 left-1'}>Principale</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(img.id)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full items-center justify-center hidden group-hover:flex"
                        ><CloseIcon /></button>
                        <div className="absolute top-1 left-1 hidden group-hover:flex gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveImage(idx, -1)}
                            disabled={idx === 0}
                            className="w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center disabled:opacity-30"
                            title="Déplacer avant"
                          ><ChevronIcon direction="up" style={{ transform: 'rotate(-90deg)' }} /></button>
                          <button
                            type="button"
                            onClick={() => moveImage(idx, 1)}
                            disabled={idx === images.length - 1}
                            className="w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center disabled:opacity-30"
                            title="Déplacer après"
                          ><ChevronIcon style={{ transform: 'rotate(-90deg)' }} /></button>
                        </div>
                      </div>
                    ))}
                    {pendingImages.map((img, idx) => (
                      <div key={img.tempId} className="relative group">
                        <img src={img.previewUrl} alt="" className="w-full aspect-square object-cover rounded-lg" />
                        {images.length === 0 && idx === 0 && (
                          <span className={theme.badge.info + ' absolute bottom-1 left-1'}>Principale</span>
                        )}
                        <span className={theme.badge.warning + ' absolute top-1 left-1'}>En attente</span>
                        <button
                          type="button"
                          onClick={() => removePendingImage(img.tempId)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full items-center justify-center hidden group-hover:flex"
                        ><CloseIcon /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Variantes ── */}
            {section === 'Variantes' && (
              <div>
                {variants.map(v => (
                  <VariantBlock
                    key={v.id}
                    productId={id}
                    variant={v}
                    onDeleted={reloadVariants}
                    onUpdated={reloadVariants}
                    stockBatchId={stockBatchId}
                  />
                ))}

                {!isEdit && pendingVariants.map(v => (
                  <DraftVariantBlock
                    key={v.tempId}
                    variant={v}
                    onChange={updated => updatePendingVariant(v.tempId, updated)}
                    onDelete={() => deletePendingVariant(v.tempId)}
                  />
                ))}

                <button
                  type="button"
                  onClick={addVariant}
                  className="w-full py-3 rounded-xl border-2 border-dashed text-sm text-violet-400 font-medium hover:border-violet-500 hover:bg-violet-600/5 transition flex items-center justify-center gap-2"
                  style={{ borderColor: theme.dark.border }}
                >
                  + Ajouter une variante
                </button>
              </div>
            )}

            {/* ── SEO ── */}
            {section === 'SEO' && (
              <div className="rounded-xl border p-6 space-y-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs text-app-muted-light">Titre (balise &lt;title&gt;)</label>
                      <span className="text-xs" style={{ color: form.meta_title.length > 70 ? '#f87171' : theme.dark.muted }}>{form.meta_title.length}/70</span>
                    </div>
                    <input
                      name="meta_title" value={form.meta_title} onChange={change} maxLength={70}
                      className={inputCls} style={bdrStyle}
                      placeholder={form.name || 'Retombe sur le nom du produit si vide'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Balise méta robots</label>
                    <Select
                      value={form.meta_robots}
                      onChange={v => setForm(f => ({ ...f, meta_robots: v }))}
                      options={[
                        { value: '', label: 'index, follow (défaut)' },
                        { value: 'noindex,follow', label: 'noindex, follow' },
                        { value: 'index,nofollow', label: 'index, nofollow' },
                        { value: 'noindex,nofollow', label: 'noindex, nofollow' },
                      ]}
                      className={inputCls}
                      style={{ ...bdrStyle, background: theme.dark.sidebar }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-app-muted-light mb-1.5">Mots-clés</label>
                    <input
                      value={form.meta_keywords} onChange={e => setForm(f => ({ ...f, meta_keywords: e.target.value }))}
                      className={inputCls} style={bdrStyle} placeholder="chaussure, sport, running"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs text-app-muted-light">Meta description</label>
                    <span className="text-xs" style={{ color: form.meta_description.length > 160 ? '#f87171' : theme.dark.muted }}>{form.meta_description.length}/160</span>
                  </div>
                  <textarea
                    name="meta_description" value={form.meta_description} onChange={change} maxLength={160} rows={3}
                    className={`${inputCls} resize-none`} style={bdrStyle}
                    placeholder={form.description ? stripHtml(form.description).slice(0, 160) : 'Retombe sur un extrait de la description si vide'}
                  />
                </div>

                {/* Images de partage (Open Graph / Twitter) */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'URL de l\'image Open Graph (Facebook/WhatsApp)', url: ogImageUrl, ref: ogImageRef, field: 'og_image' },
                    { label: 'URL de l\'image de la carte Twitter', url: twitterImageUrl, ref: twitterImageRef, field: 'twitter_image' },
                  ].map(({ label, url, ref, field }) => (
                    <div key={field}>
                      <label className="block text-xs text-app-muted-light mb-1.5">{label}</label>
                      <input ref={ref} type="file" accept="image/*" className="hidden"
                        onChange={e => e.target.files[0] && uploadSeoImage(field, e.target.files[0])} />
                      {!isEdit ? (
                        <div className="rounded-xl border-2 border-dashed flex items-center justify-center aspect-video text-xs text-app-muted text-center px-4" style={{ borderColor: theme.dark.border }}>
                          Disponible après le premier enregistrement du produit
                        </div>
                      ) : url ? (
                        <div className="relative group aspect-video">
                          <img src={url} alt="" className="w-full h-full object-cover rounded-xl" />
                          <button type="button" onClick={() => ref.current?.click()}
                            className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition text-white text-sm">Changer</button>
                        </div>
                      ) : (
                        <div onClick={() => ref.current?.click()}
                          className="border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer hover:border-violet-500 transition aspect-video text-sm text-violet-400"
                          style={{ borderColor: theme.dark.border }}
                        >Télécharger une image</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Aperçu façon résultat Google */}
                <div>
                  <p className="text-xs text-app-muted-light mb-2">Aperçu dans les résultats de recherche</p>
                  <div className="rounded-lg border p-4" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
                    <p className="text-xs text-emerald-400 truncate">
                      {user?.store_slug ? `mzsolutions.app/store/${user.store_slug}/products/${id || '…'}` : 'mzsolutions.app/store/…'}
                    </p>
                    <p className="text-[#8ab4f8] text-lg truncate mt-0.5">{form.meta_title || form.name || 'Titre du produit'}</p>
                    <p className="text-sm text-app-muted-light mt-0.5 line-clamp-2">
                      {form.meta_description || stripHtml(form.description) || 'La description du produit apparaîtra ici.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Autres ── */}
            {section === 'Autres' && (
              <div className="space-y-4">
                {/* Alerte de stock */}
                <div className="rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                  <p className="text-sm font-semibold text-app-primary mb-1">Alerte de stock</p>
                  <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>
                    Seuils propres à ce produit — remplacent le seuil global de la boutique (Stock & Inventaire) pour ce produit précis. Laissez vide pour garder le seuil global.
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-app-muted-light mb-1.5">Seuil 1 — stock faible</label>
                      <input type="number" min="0" value={form.stock_alert_1} onChange={e => setForm(f => ({ ...f, stock_alert_1: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="10" />
                    </div>
                    <div>
                      <label className="block text-xs text-app-muted-light mb-1.5">Seuil 2 — très faible</label>
                      <input type="number" min="0" value={form.stock_alert_2} onChange={e => setForm(f => ({ ...f, stock_alert_2: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="5" />
                    </div>
                    <div>
                      <label className="block text-xs text-app-muted-light mb-1.5">Seuil 3 — critique</label>
                      <input type="number" min="0" value={form.stock_alert_3} onChange={e => setForm(f => ({ ...f, stock_alert_3: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="3" />
                    </div>
                  </div>
                </div>

                {/* Position en entrepôt */}
                <div className="rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-app-primary">Position en entrepôt</p>
                    <Toggle value={form.has_position} onChange={v => setForm(f => ({ ...f, has_position: v }))} />
                  </div>
                  <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>
                    Purement informatif — pour retrouver physiquement l'article, aucun effet sur le stock ou la vente.
                  </p>
                  {form.has_position && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Allée / Rayon</label>
                        <input value={form.position_range} onChange={e => setForm(f => ({ ...f, position_range: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="ex: A" />
                      </div>
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Étage / Niveau</label>
                        <input value={form.position_stage} onChange={e => setForm(f => ({ ...f, position_stage: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="ex: 1" />
                      </div>
                      <div>
                        <label className="block text-xs text-app-muted-light mb-1.5">Emplacement</label>
                        <input value={form.position_slot} onChange={e => setForm(f => ({ ...f, position_slot: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="ex: Milieu" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Visibilité sur la boutique */}
                <div className="rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                  <p className="text-sm font-semibold text-app-primary mb-1">Visibilité sur la boutique</p>
                  <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>
                    "Produit actif" (onglet Détails) contrôle si la fiche existe publiquement — ces réglages affinent ce qui s'y affiche.
                  </p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    {[
                      ['Afficher le titre', 'show_title'],
                      ['Afficher les images', 'show_images'],
                      ['Afficher le prix hors remise (barré)', 'show_full_price'],
                      ['Afficher le prix réduit', 'show_discounted_price'],
                      ['Afficher un compte à rebours', 'show_countdown'],
                    ].map(([label, name]) => (
                      <div key={name} className="flex items-center justify-between py-1">
                        <span className="text-sm text-app-primary">{label}</span>
                        <Toggle value={form[name]} onChange={v => setForm(f => ({ ...f, [name]: v }))} />
                      </div>
                    ))}
                  </div>
                  {form.show_countdown && (
                    <div className="mt-3">
                      <label className="block text-xs text-app-muted-light mb-1.5">Fin du compte à rebours</label>
                      <input
                        type="datetime-local" value={form.countdown_end}
                        onChange={e => setForm(f => ({ ...f, countdown_end: e.target.value }))}
                        className={`${inputCls} max-w-xs`} style={bdrStyle}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => navigate('/dashboard/produits')} className="text-sm text-app-muted-light hover:text-app-primary transition">
                  ← Retour à la liste
                </button>
                {sectionIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setSection(SECTIONS[sectionIndex - 1])}
                    className="px-4 py-2 rounded-lg text-sm font-medium border text-app-primary hover:bg-violet-500/5 transition"
                    style={bdrStyle}
                  >
                    ← Précédent
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {sectionIndex < SECTIONS.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setSection(SECTIONS[sectionIndex + 1])}
                    className="px-4 py-2 rounded-lg text-sm font-medium border text-app-primary hover:bg-violet-500/5 transition"
                    style={bdrStyle}
                  >
                    Suivant →
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-60"
                >
                  {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Enregistrer le produit'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}
