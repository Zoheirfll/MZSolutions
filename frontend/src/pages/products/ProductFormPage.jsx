import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const SECTIONS = ['Détails du produit', 'Description', 'Images', 'Variantes', 'SEO']

const EMPTY = {
  name: '', price: '', compare_price: '', cost_price: '',
  stock: '', sku: '', weight: '', categories: [], supplier: '',
  free_shipping: false, allow_out_of_stock: false, drop_shipping: false,
  is_active: true, description: '',
}

const EMPTY_OPTION = {
  value: '', price: '', cost_price: '', stock: 0, sku: '',
  allow_out_of_stock: false, is_active: true,
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${value ? 'bg-violet-600' : 'bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
      {label && <span className="text-sm text-gray-300">{label}</span>}
    </div>
  )
}

function VariantBlock({ productId, variant, onDeleted, onUpdated }) {
  const [expanded, setExpanded] = useState(true)
  const [name, setName]         = useState(variant.name)
  const [subName, setSubName]   = useState(variant.sub_option_name || '')
  const [options, setOptions]   = useState(variant.options || [])
  const [saving, setSaving]     = useState(false)
  const optImgRefs              = useRef({})

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
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
      })
    } catch {}
  }

  const uploadOptionImage = async (opt, file) => {
    const fd = new FormData()
    fd.append('image', file)
    const { data } = await api.put(
      `/products/${productId}/variants/${variant.id}/options/${opt.id}/`,
      fd, { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    setOptions(o => o.map(x => x.id === opt.id ? data : x))
  }

  const deleteOption = async (oid) => {
    await api.delete(`/products/${productId}/variants/${variant.id}/options/${oid}/`)
    setOptions(o => o.filter(x => x.id !== oid))
  }

  return (
    <div className="rounded-xl border mb-3 overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      {/* Header variante */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: theme.dark.border }}>
        <span className="text-gray-600 cursor-grab text-lg">⠿</span>
        <div className="flex-1 flex items-center gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={saveVariant}
            placeholder="Nom de la variante (ex: Couleur)"
            className="flex-1 px-2 py-1 rounded text-sm text-gray-200 bg-transparent border-b outline-none focus:border-violet-500 transition"
            style={{ borderColor: theme.dark.border }}
          />
          <input
            value={subName}
            onChange={e => setSubName(e.target.value)}
            onBlur={saveVariant}
            placeholder="Nom des sous-options (ex: Taille)"
            className="flex-1 px-2 py-1 rounded text-sm text-gray-200 bg-transparent border-b outline-none focus:border-violet-500 transition"
            style={{ borderColor: theme.dark.border }}
          />
        </div>
        <button onClick={deleteVariant} className="w-8 h-8 flex items-center justify-center rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition text-sm">🗑️</button>
        <button onClick={() => setExpanded(e => !e)} className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-white/10 transition">
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
                  <span className="text-sm text-gray-400 font-medium">Option {idx + 1}</span>
                </div>
                <button onClick={() => deleteOption(opt.id)} className="w-7 h-7 flex items-center justify-center rounded bg-red-600/15 text-red-400 hover:bg-red-600/30 transition text-sm">🗑️</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Left — champs */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Valeur de l'option</label>
                    <input
                      value={opt.value}
                      onChange={e => updateOption(opt.id, { value: e.target.value })}
                      onBlur={() => saveOption(opt)}
                      className={inputCls} style={bdrStyle}
                      placeholder="ex: Rouge"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Stock de l'option</label>
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
                      <label className="block text-xs text-gray-400 mb-1">Prix de l'option <span className="text-gray-600">DZD</span></label>
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
                      <label className="block text-xs text-gray-400 mb-1">Prix d'achat <span className="text-gray-600">DZD</span></label>
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
                    <label className="block text-xs text-gray-400 mb-1">SKU</label>
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
                      <span className="text-3xl text-gray-600 mb-2">🖼</span>
                      <span className="text-xs text-gray-500 text-center px-2">Drag and drop or <span className="text-violet-400">browse</span> to upload</span>
                      <span className="text-xs mt-1" style={{ color: theme.dark.muted }}>PNG, JPG, GIF up to 5MB each</span>
                    </div>
                  )}
                </div>
              </div>
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

  const [section, setSection]       = useState(SECTIONS[0])
  const [form, setForm]             = useState(EMPTY)
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers]   = useState([])
  const [images, setImages]         = useState([])
  const [variants, setVariants]     = useState([])
  const [saving, setSaving]         = useState(false)
  const [errors, setErrors]         = useState({})
  const fileRef = useRef()

  useEffect(() => {
    api.get('/products/categories/?parent=null').then(({ data }) => setCategories(data.results ?? data)).catch(() => {})
    api.get('/products/suppliers/').then(({ data }) => setSuppliers(data)).catch(() => {})
    if (isEdit) {
      api.get(`/products/${id}/`).then(({ data }) => {
        setForm({
          name: data.name, price: data.price, compare_price: data.compare_price ?? '',
          cost_price: data.cost_price ?? '', stock: data.stock, sku: data.sku ?? '',
          weight: data.weight ?? '', categories: (data.categories || []).map(Number), supplier: data.supplier ?? '',
          free_shipping: data.free_shipping, allow_out_of_stock: data.allow_out_of_stock,
          drop_shipping: data.drop_shipping, is_active: data.is_active,
          description: data.description,
        })
        setImages(data.images || [])
        setVariants(data.variants || [])
      }).catch(() => {})
    }
  }, [id, isEdit])

  const change = e => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
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
    }
    try {
      if (isEdit) {
        await api.put(`/products/${id}/`, payload)
      } else {
        const { data } = await api.post('/products/', payload)
        navigate(`/dashboard/produits/${data.id}/modifier`)
        return
      }
      navigate('/dashboard/produits')
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = async (files) => {
    for (const file of files) {
      const fd = new FormData()
      fd.append('image', file)
      const { data } = await api.post(`/products/${id}/images/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImages(imgs => [...imgs, data])
    }
  }

  const handleDeleteImage = async (imgId) => {
    await api.delete(`/products/${id}/images/${imgId}/`)
    setImages(imgs => imgs.filter(i => i.id !== imgId))
  }

  const addVariant = async () => {
    if (!isEdit) {
      alert('Enregistrez d\'abord le produit avant d\'ajouter des variantes.')
      return
    }
    const { data } = await api.post(`/products/${id}/variants/`, { name: 'Nouvelle variante', order: variants.length })
    setVariants(v => [...v, { ...data, options: [] }])
  }

  const reloadVariants = async () => {
    if (!isEdit) return
    const { data } = await api.get(`/products/${id}/variants/`)
    setVariants(data)
  }

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title={isEdit ? 'Modifier le produit' : 'Ajouter un produit'}>
      <div className="flex gap-5 h-full">

        {/* Section nav gauche */}
        <div className="w-48 flex-shrink-0">
          <div className="rounded-xl border overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            {SECTIONS.map(s => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`w-full text-left px-4 py-3 text-sm border-b transition ${
                  section === s ? 'text-violet-300 bg-violet-600/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/3'
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

            {/* ── Détails du produit ── */}
            {section === 'Détails du produit' && (
              <div className="rounded-xl border p-6 space-y-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs text-gray-400 mb-1.5">Nom *</label>
                    <input name="name" value={form.name} onChange={change} required className={inputCls} style={bdrStyle} placeholder="Nom du produit" />
                    {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Catégories</label>
                    <div className="rounded-lg border p-2 max-h-32 overflow-y-auto space-y-1" style={{ borderColor: theme.dark.border }}>
                      {categories.length === 0 && <p className="text-xs text-gray-500 px-1">Aucune catégorie</p>}
                      {categories.map(c => {
                        const checked = form.categories.includes(c.id)
                        return (
                          <label key={c.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-white/5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setForm(f => ({
                                ...f,
                                categories: checked
                                  ? f.categories.filter(id => id !== c.id)
                                  : [...f.categories, c.id],
                              }))}
                              className="accent-violet-500"
                            />
                            <span className="text-sm text-gray-300">{c.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Stock</label>
                    <input name="stock" type="number" min="0" value={form.stock} onChange={change} className={inputCls} style={bdrStyle} placeholder="0" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Prix de vente * <span className="text-gray-600">DZD</span></label>
                    <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={change} required className={inputCls} style={bdrStyle} placeholder="0" />
                    {errors.price && <p className="text-red-400 text-xs mt-1">{errors.price}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Prix hors remise <span className="text-gray-600">DZD</span></label>
                    <input name="compare_price" type="number" min="0" step="0.01" value={form.compare_price} onChange={change} className={inputCls} style={bdrStyle} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Prix d'achat <span className="text-gray-600">DZD</span></label>
                    <input name="cost_price" type="number" min="0" step="0.01" value={form.cost_price} onChange={change} className={inputCls} style={bdrStyle} placeholder="0" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">SKU</label>
                    <input name="sku" value={form.sku} onChange={change} className={inputCls} style={bdrStyle} placeholder="Référence produit" />
                    {errors.sku && <p className="text-red-400 text-xs mt-1">{errors.sku}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Poids <span className="text-gray-600">Kg</span></label>
                    <input name="weight" type="number" min="0" step="0.01" value={form.weight} onChange={change} className={inputCls} style={bdrStyle} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Fournisseur</label>
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
                    ['Autoriser achats en rupture de stock', 'allow_out_of_stock'],
                    ['Drop Shipping', 'drop_shipping'],
                    ['Produit actif', 'is_active'],
                  ].map(([label, name]) => (
                    <div key={name} className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-300">{label}</span>
                      <Toggle value={form[name]} onChange={v => setForm(f => ({ ...f, [name]: v }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Description ── */}
            {section === 'Description' && (
              <div className="rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <label className="block text-xs text-gray-400 mb-2">Description du produit</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={change}
                  rows={10}
                  className={`${inputCls} resize-none`}
                  style={bdrStyle}
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
                  onClick={() => isEdit && fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); isEdit && handleImageUpload(Array.from(e.dataTransfer.files)) }}
                  className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition hover:border-violet-500"
                  style={{ borderColor: theme.dark.border }}
                >
                  <p className="text-3xl mb-3">🖼️</p>
                  <p className="text-gray-400 text-sm">Glissez-déposez ou cliquez pour uploader</p>
                  <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>PNG, JPG, GIF — max 5MB chacun</p>
                  {!isEdit && <p className="text-xs mt-2 text-amber-400">Enregistrez d'abord le produit pour uploader des images</p>}
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-5 gap-3 mt-5">
                    {images.map(img => (
                      <div key={img.id} className="relative group">
                        <img src={img.image_url} alt="" className="w-full aspect-square object-cover rounded-lg" />
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(img.id)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full text-xs items-center justify-center hidden group-hover:flex"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Variantes ── */}
            {section === 'Variantes' && (
              <div>
                {!isEdit && (
                  <div className="rounded-xl border p-6 text-center mb-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-amber-400 text-sm">Enregistrez d'abord le produit avant d'ajouter des variantes.</p>
                  </div>
                )}

                {variants.map(v => (
                  <VariantBlock
                    key={v.id}
                    productId={id}
                    variant={v}
                    onDeleted={reloadVariants}
                    onUpdated={reloadVariants}
                  />
                ))}

                {isEdit && (
                  <button
                    type="button"
                    onClick={addVariant}
                    className="w-full py-3 rounded-xl border-2 border-dashed text-sm text-violet-400 font-medium hover:border-violet-500 hover:bg-violet-600/5 transition flex items-center justify-center gap-2"
                    style={{ borderColor: theme.dark.border }}
                  >
                    + Ajouter une option
                  </button>
                )}
              </div>
            )}

            {/* ── SEO ── */}
            {section === 'SEO' && (
              <div className="rounded-xl border p-8 text-center" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <svg className="w-8 h-8 mx-auto mb-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <p className="text-gray-400 font-medium">SEO disponible prochainement</p>
              </div>
            )}

            {/* Footer actions */}
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={() => navigate('/dashboard/produits')} className="text-sm text-gray-400 hover:text-gray-200 transition">
                ← Retour à la liste
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-60"
              >
                {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Enregistrer le produit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}
