import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'
import { useCart } from '../../context/CartContext'

function StarRating({ rating, size = 'text-base' }) {
  return (
    <span className={size}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= rating ? 'text-amber-400' : 'text-gray-300'}>★</span>
      ))}
    </span>
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

  if (loading) return (
    <StorefrontLayout>
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-gray-400">Chargement…</div>
    </StorefrontLayout>
  )

  if (!product) return (
    <StorefrontLayout>
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-gray-400">Produit introuvable.</div>
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
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const handleBuyNow = () => {
    addItem(slug, buildCartItem())
    navigate(`/store/${slug}/checkout`)
  }

  return (
    <StorefrontLayout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-400 mb-6 flex items-center gap-2">
          <Link to={`/store/${slug}`} className="hover:text-violet-600">Accueil</Link>
          <span>/</span>
          <Link to={`/store/${slug}/products`} className="hover:text-violet-600">Produits</Link>
          <span>/</span>
          <span className="text-gray-700">{product.name}</span>
        </nav>

        <div className="flex gap-10">
          {/* Galerie */}
          <div className="w-96 shrink-0">
            <div className="aspect-square border border-gray-200 rounded-xl overflow-hidden bg-gray-50 mb-3">
              {activeImage
                ? <img src={activeImage} alt={product.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-6xl text-gray-300">📦</div>
              }
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {product.images.map(img => (
                  <button key={img.id} onClick={() => setActiveImage(img.url)}
                    className={`w-16 h-16 rounded-lg border-2 overflow-hidden transition ${activeImage === img.url ? 'border-violet-500' : 'border-gray-200 hover:border-gray-400'}`}>
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
              <div className="flex gap-1.5 mb-3">
                {product.categories.map(c => (
                  <span key={c.id} className="text-xs px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full border border-violet-200">{c.name}</span>
                ))}
              </div>
            )}

            <h1 className="text-2xl font-bold text-gray-900 mb-3">{product.name}</h1>

            {/* Rating */}
            {product.avg_rating && (
              <div className="flex items-center gap-2 mb-4">
                <StarRating rating={Math.round(product.avg_rating)} />
                <span className="text-sm text-gray-500">{product.avg_rating}/5 ({product.reviews_count} avis)</span>
              </div>
            )}

            {/* Prix */}
            <div className="flex items-baseline gap-3 mb-5">
              <span className="text-3xl font-bold text-violet-700">{Number(displayPrice).toLocaleString('fr-DZ')} DZD</span>
              {product.compare_price && (
                <span className="text-lg text-gray-400 line-through">{Number(product.compare_price).toLocaleString('fr-DZ')} DZD</span>
              )}
              {product.compare_price && (
                <span className="text-sm bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                  -{Math.round((1 - product.price / product.compare_price) * 100)}%
                </span>
              )}
            </div>

            {/* Variantes */}
            {product.variants.map(v => (
              <div key={v.id} className="mb-5">
                <p className="text-sm font-semibold text-gray-700 mb-2">{v.name}</p>
                <div className="flex gap-2 flex-wrap">
                  {v.options.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedOpts(s => ({ ...s, [v.id]: opt }))}
                      className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition ${
                        selectedOpts[v.id]?.id === opt.id
                          ? 'border-violet-600 bg-violet-50 text-violet-700'
                          : 'border-gray-300 text-gray-700 hover:border-violet-400'
                      }`}
                    >
                      {opt.image_url && <img src={opt.image_url} alt="" className="w-4 h-4 rounded inline-block mr-1.5 object-cover" />}
                      {opt.value}
                      {opt.price && Number(opt.price) !== Number(product.price) && (
                        <span className="ml-1 text-xs text-gray-500">({Number(opt.price).toLocaleString('fr-DZ')})</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Stock + livraison */}
            <div className="flex items-center gap-4 mb-6">
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {inStock ? '✓ En stock' : '✗ Rupture de stock'}
              </span>
              {product.free_shipping && (
                <span className="text-sm text-emerald-600">🚚 Livraison gratuite</span>
              )}
            </div>

            {/* Boutons commande */}
            <div className="flex gap-3">
              <button
                onClick={handleAddToCart}
                disabled={!inStock}
                className="flex-1 py-3.5 rounded-xl font-semibold text-base border-2 border-violet-600 text-violet-700 hover:bg-violet-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {added ? 'Ajouté ✓' : 'Ajouter au panier'}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={!inStock}
                className="flex-1 py-3.5 rounded-xl font-semibold text-white text-base disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
              >
                Acheter maintenant
              </button>
            </div>

            {/* Description */}
            {product.description && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{product.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Avis */}
        {product.reviews.length > 0 && (
          <div className="mt-12 pt-8 border-t border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              Avis clients <span className="text-gray-400 font-normal text-base">({product.reviews_count})</span>
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {product.reviews.map(r => (
                <div key={r.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <StarRating rating={r.rating} size="text-sm" />
                      <p className="text-sm font-medium text-gray-900 mt-0.5">
                        {r.first_name} {r.last_name}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('fr-DZ')}</p>
                  </div>
                  {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
                  {r.image_url && <img src={r.image_url} alt="" className="mt-2 w-20 h-20 rounded-lg object-cover" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </StorefrontLayout>
  )
}
