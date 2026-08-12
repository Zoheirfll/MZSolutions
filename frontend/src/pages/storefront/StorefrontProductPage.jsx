import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'
import { useCart } from '../../context/CartContext'
import { trackEvent } from '../../lib/pixels'
import useDocumentMeta from '../../hooks/useDocumentMeta'

function PackageIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}

function TruckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 17h4V5H2v12h3" />
      <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  )
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  )
}

function CartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

function BoltIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </svg>
  )
}

function StarRating({ rating, size = 'text-base', onChange }) {
  return (
    <span className={size}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          onClick={onChange ? () => onChange(i) : undefined}
          style={{ color: i <= rating ? '#fbbf24' : 'var(--sf-header-border)' }}
          className={onChange ? 'cursor-pointer' : ''}
        >★</span>
      ))}
    </span>
  )
}

const modalInputCls = 'w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-colors'
const modalInputStyle = { background: 'var(--sf-body-bg)', border: '1px solid var(--sf-header-border)', color: 'var(--sf-text)' }

function ReviewFormModal({ slug, productId, onClose, onSubmitted }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', rating: 5, comment: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await publicApi.post('/reviews/', { store_slug: slug, product: productId, ...form })
      onSubmitted()
    } catch (err) {
      setError(err.response?.data?.detail || "Une erreur est survenue lors de l'envoi.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--sf-card-bg)', border: '1px solid var(--sf-header-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold" style={{ color: 'var(--sf-text)' }}>Laisser un avis</h3>
          <button onClick={onClose} className="transition cursor-pointer" style={{ color: 'var(--sf-text-muted)' }}>
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Note</label>
            <StarRating rating={form.rating} size="text-2xl" onChange={r => setForm(f => ({ ...f, rating: r }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Prénom *</label>
              <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required className={modalInputCls} style={modalInputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Nom</label>
              <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className={modalInputCls} style={modalInputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Email (optionnel)</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={modalInputCls} style={modalInputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Commentaire</label>
            <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={3} className={`${modalInputCls} resize-none`} style={modalInputStyle} placeholder="Votre expérience avec ce produit…" />
          </div>
          {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60" style={{ background: 'var(--sf-primary)' }}>
            {saving ? 'Envoi…' : "Envoyer l'avis"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function StorefrontProductPage() {
  const { slug, productId } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const [product,       setProduct]       = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [activeImage,   setActiveImage]   = useState(null)
  const [selectedOpts,  setSelectedOpts]  = useState({})
  const [added,         setAdded]         = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewSent,      setReviewSent]      = useState(false)

  useEffect(() => {
    setLoading(true)
    publicApi.get(`/store/${slug}/products/${productId}/`)
      .then(({ data }) => {
        setProduct(data)
        if (data.images?.length > 0) setActiveImage(data.images[0].url)
        // Pré-sélectionner première option de chaque variante
        const defaults = {}
        data.variants?.forEach(v => { if (v.options?.[0]) defaults[v.id] = v.options[0] })
        setSelectedOpts(defaults)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug, productId])

  useDocumentMeta(
    product?.meta_title || product?.name,
    product?.meta_description || (product?.description || '').slice(0, 160),
  )

  if (loading) return (
    <StorefrontLayout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="h-4 w-64 rounded animate-pulse mb-6" style={{ background: 'var(--sf-primary-light)' }} />
        <div className="flex flex-col md:flex-row gap-10">
          <div className="w-full md:w-96 shrink-0">
            <div className="aspect-square rounded-xl animate-pulse mb-3" style={{ background: 'var(--sf-primary-light)' }} />
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => <div key={i} className="w-16 h-16 rounded-lg animate-pulse" style={{ background: 'var(--sf-primary-light)' }} />)}
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-4">
            <div className="h-7 w-2/3 rounded animate-pulse" style={{ background: 'var(--sf-primary-light)' }} />
            <div className="h-9 w-40 rounded animate-pulse" style={{ background: 'var(--sf-primary-light)' }} />
            <div className="h-24 w-full rounded animate-pulse" style={{ background: 'var(--sf-primary-light)' }} />
            <div className="flex gap-3">
              <div className="h-12 flex-1 rounded-lg animate-pulse" style={{ background: 'var(--sf-primary-light)' }} />
              <div className="h-12 flex-1 rounded-lg animate-pulse" style={{ background: 'var(--sf-primary-light)' }} />
            </div>
          </div>
        </div>
      </div>
    </StorefrontLayout>
  )

  if (!product) return (
    <StorefrontLayout>
      <div className="flex flex-col items-center justify-center text-center py-20 px-6" style={{ color: 'var(--sf-text-muted)' }}>
        <PackageIcon className="w-12 h-12 mb-3 opacity-30" />
        <p>Produit introuvable.</p>
      </div>
    </StorefrontLayout>
  )

  // Prix effectif selon option sélectionnée
  const selectedOption = Object.values(selectedOpts)[0] || null
  const displayPrice   = selectedOption?.price ?? product.price
  const inStock = product.variants.length > 0
    ? Object.values(selectedOpts).every(o => o.stock > 0 || o.allow_out_of_stock)
    : (product.stock > 0 || product.allow_out_of_stock)

  const buildCartItem = () => {
    const key = selectedOption ? `v${selectedOption.id}` : `p${product.id}`
    return {
      _key:           key,
      product:        product.id,
      variant_option: selectedOption?.id || null,
      product_name:   selectedOption ? `${product.name} — ${selectedOption.value}` : product.name,
      price:          displayPrice,
      quantity:       1,
      image_url:      activeImage,
    }
  }

  const handleAddToCart = () => {
    addItem(slug, buildCartItem())
    trackEvent('AddToCart', { content_ids: [product.id], content_name: product.name, value: displayPrice, currency: 'DZD' })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const handleBuyNow = () => {
    addItem(slug, buildCartItem())
    trackEvent('AddToCart', { content_ids: [product.id], content_name: product.name, value: displayPrice, currency: 'DZD' })
    navigate(`/store/${slug}/checkout`)
  }

  const badgeCls = 'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset'

  return (
    <StorefrontLayout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav className="text-sm mb-6 flex items-center gap-2" style={{ color: 'var(--sf-text-muted)' }}>
          <Link to={`/store/${slug}`} className="hover:opacity-80" style={{ color: 'var(--sf-text-muted)' }}>Accueil</Link>
          <span>/</span>
          <Link to={`/store/${slug}/products`} className="hover:opacity-80" style={{ color: 'var(--sf-text-muted)' }}>Produits</Link>
          <span>/</span>
          <span style={{ color: 'var(--sf-text)' }}>{product.name}</span>
        </nav>

        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          {/* Galerie */}
          <div className="w-full md:w-96 shrink-0">
            <div className="aspect-square rounded-xl overflow-hidden mb-3" style={{ border: '1px solid var(--sf-header-border)', background: 'var(--sf-primary-light)' }}>
              {activeImage
                ? <img src={activeImage} alt={product.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center opacity-30"><PackageIcon className="w-16 h-16" /></div>
              }
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {product.images.map(img => (
                  <button key={img.id} onClick={() => setActiveImage(img.url)}
                    className="w-16 h-16 rounded-lg overflow-hidden transition"
                    style={{ border: `2px solid ${activeImage === img.url ? 'var(--sf-primary)' : 'var(--sf-header-border)'}` }}>
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Détails */}
          <div className="flex-1 min-w-0">
            {/* Catégories */}
            {product.categories.length > 0 && (
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {product.categories.map(c => (
                  <span key={c.id} className={`${badgeCls} ring-violet-400/30`} style={{ background: 'var(--sf-primary-light)', color: 'var(--sf-primary)' }}>{c.name}</span>
                ))}
              </div>
            )}

            <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--sf-text)' }}>{product.name}</h1>

            {/* Rating */}
            {product.avg_rating && (
              <div className="flex items-center gap-2 mb-4">
                <StarRating rating={Math.round(product.avg_rating)} />
                <span className="text-sm" style={{ color: 'var(--sf-text-muted)' }}>{product.avg_rating}/5 ({product.reviews_count} avis)</span>
              </div>
            )}

            {/* Prix */}
            <div className="flex items-baseline gap-3 mb-5 flex-wrap">
              <span className="text-3xl font-bold" style={{ color: 'var(--sf-primary)' }}>{Number(displayPrice).toLocaleString('fr-DZ')} DZD</span>
              {product.original_price ? (
                <>
                  <span className="text-lg line-through" style={{ color: 'var(--sf-text-muted)' }}>{Number(product.original_price).toLocaleString('fr-DZ')} DZD</span>
                  <span className={`${badgeCls} ring-red-400/40`} style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
                    -{Math.round((1 - product.price / product.original_price) * 100)}%
                  </span>
                </>
              ) : product.compare_price && (
                <>
                  <span className="text-lg line-through" style={{ color: 'var(--sf-text-muted)' }}>{Number(product.compare_price).toLocaleString('fr-DZ')} DZD</span>
                  <span className={`${badgeCls} ring-red-400/40`} style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
                    -{Math.round((1 - product.price / product.compare_price) * 100)}%
                  </span>
                </>
              )}
            </div>

            {/* Variantes */}
            {product.variants.map(v => (
              <div key={v.id} className="mb-5">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--sf-text)' }}>{v.name}</p>
                <div className="flex gap-2 flex-wrap">
                  {v.options.map(opt => {
                    const active = selectedOpts[v.id]?.id === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedOpts(s => ({ ...s, [v.id]: opt }))}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium transition"
                        style={active
                          ? { border: '1px solid var(--sf-primary)', background: 'var(--sf-primary-light)', color: 'var(--sf-primary)' }
                          : { border: '1px solid var(--sf-header-border)', color: 'var(--sf-text)' }}
                      >
                        {opt.image_url && <img src={opt.image_url} alt="" className="w-4 h-4 rounded inline-block mr-1.5 object-cover" />}
                        {opt.value}
                        {opt.price && Number(opt.price) !== Number(product.price) && (
                          <span className="ml-1 text-xs" style={{ color: 'var(--sf-text-muted)' }}>({Number(opt.price).toLocaleString('fr-DZ')})</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Stock + livraison */}
            <div className="flex items-center flex-wrap gap-2 mb-6">
              <span className={`${badgeCls} ${inStock ? 'ring-emerald-400/40' : 'ring-red-400/40'}`}
                style={{ background: inStock ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: inStock ? '#6ee7b7' : '#fca5a5' }}>
                {inStock ? <CheckIcon className="w-3 h-3" /> : <XIcon className="w-3 h-3" />}
                {inStock ? 'En stock' : 'Rupture de stock'}
              </span>
              {product.free_shipping && (
                <span className={`${badgeCls} ring-violet-400/30`} style={{ background: 'var(--sf-primary-light)', color: 'var(--sf-primary)' }}>
                  <TruckIcon className="w-3 h-3" /> Livraison gratuite
                </span>
              )}
            </div>

            {/* Boutons commande */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleAddToCart}
                disabled={!inStock}
                className="flex-1 py-3.5 text-base rounded-xl font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
                style={{ border: '1px solid var(--sf-header-border)', color: 'var(--sf-text)' }}
              >
                <CartIcon className="w-4 h-4" />
                {added ? <><CheckIcon className="w-4 h-4" /> Ajouté</> : 'Ajouter au panier'}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={!inStock}
                className="flex-1 py-3.5 text-base rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
                style={{ background: 'var(--sf-primary)' }}
              >
                <BoltIcon className="w-4 h-4" />
                Acheter maintenant
              </button>
            </div>

            {/* Description */}
            {product.description && (
              <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--sf-header-border)' }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--sf-text)' }}>Description</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--sf-text-muted)' }}>{product.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Avis */}
        <div className="mt-12 pt-8" style={{ borderTop: '1px solid var(--sf-header-border)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
            <h2 className="text-xl font-bold" style={{ color: 'var(--sf-text)' }}>
              Avis clients {product.reviews.length > 0 && <span className="font-normal text-base" style={{ color: 'var(--sf-text-muted)' }}>({product.reviews_count})</span>}
            </h2>
            <button onClick={() => setReviewModalOpen(true)} className="px-4 py-2 rounded-lg text-sm font-medium transition" style={{ border: '1px solid var(--sf-header-border)', color: 'var(--sf-text)' }}>
              Laisser un avis
            </button>
          </div>

          {product.reviews.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--sf-text-muted)' }}>Aucun avis pour l'instant. Soyez le premier à en laisser un !</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {product.reviews.map(r => (
                <div key={r.id} className="p-4 rounded-xl" style={{ background: 'var(--sf-card-bg)', border: '1px solid var(--sf-header-border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <StarRating rating={r.rating} size="text-sm" />
                      <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--sf-text)' }}>
                        {r.first_name} {r.last_name}
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--sf-text-muted)' }}>{new Date(r.created_at).toLocaleDateString('fr-DZ')}</p>
                  </div>
                  {r.comment && <p className="text-sm" style={{ color: 'var(--sf-text-muted)' }}>{r.comment}</p>}
                  {r.image_url && <img src={r.image_url} alt="" className="mt-2 w-20 h-20 rounded-lg object-cover" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {reviewModalOpen && (
        <ReviewFormModal
          slug={slug}
          productId={product.id}
          onClose={() => setReviewModalOpen(false)}
          onSubmitted={() => { setReviewModalOpen(false); setReviewSent(true) }}
        />
      )}

      {reviewSent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setReviewSent(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: 'var(--sf-card-bg)', border: '1px solid var(--sf-header-border)' }} onClick={e => e.stopPropagation()}>
            <div className="inline-flex w-14 h-14 rounded-full items-center justify-center mb-3 ring-1 ring-inset ring-emerald-400/40" style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>
              <CheckIcon className="w-7 h-7" />
            </div>
            <h3 className="font-semibold mb-1" style={{ color: 'var(--sf-text)' }}>Merci pour votre avis !</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--sf-text-muted)' }}>Il sera publié après modération par le vendeur.</p>
            <button onClick={() => setReviewSent(false)} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition" style={{ background: 'var(--sf-primary)' }}>Fermer</button>
          </div>
        </div>
      )}
    </StorefrontLayout>
  )
}
