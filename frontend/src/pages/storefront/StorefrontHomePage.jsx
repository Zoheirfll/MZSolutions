import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'

function PackageIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
    </svg>
  )
}

function TruckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 17h4V5H2v12h3" /><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" />
      <circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  )
}

function ProductCard({ product, slug }) {
  const strikePrice = product.original_price || product.compare_price
  const discount = strikePrice
    ? Math.round((1 - product.price / strikePrice) * 100)
    : null

  return (
    <Link to={`/store/${slug}/products/${product.id}`}
      className="group rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg block"
      style={{ background: 'var(--sf-card-bg)', borderColor: 'color-mix(in srgb, var(--sf-primary) 15%, transparent)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--sf-primary) 40%, transparent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--sf-primary) 15%, transparent)' }}>
      <div className="relative aspect-square overflow-hidden" style={{ background: 'var(--sf-primary-light)' }}>
        {product.image_url
          ? <img src={product.image_url} alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full flex items-center justify-center opacity-30">
              <PackageIcon className="w-12 h-12" />
            </div>
        }
        {discount && (
          <span className="absolute top-2.5 left-2.5 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm">
            -{discount}%
          </span>
        )}
        {product.free_shipping && (
          <span className="absolute top-2.5 right-2.5 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm flex items-center gap-0.5">
            <TruckIcon className="w-2.5 h-2.5" /> Gratuit
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="text-sm font-semibold truncate transition-colors" style={{ color: 'var(--sf-text)' }}>{product.name}</p>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="font-bold text-base" style={{ color: 'var(--sf-primary)' }}>{Number(product.price).toLocaleString('fr-DZ')} DA</span>
          {strikePrice && (
            <span className="text-xs line-through" style={{ color: 'var(--sf-text-muted)' }}>{Number(strikePrice).toLocaleString('fr-DZ')}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100" style={{ background: 'var(--sf-card-bg)' }}>
      <div className="aspect-square animate-pulse" style={{ background: 'var(--sf-primary-light)' }} />
      <div className="p-3.5 space-y-2">
        <div className="h-3.5 rounded-lg animate-pulse w-3/4" style={{ background: 'var(--sf-primary-light)' }} />
        <div className="h-3.5 rounded-lg animate-pulse w-1/2" style={{ background: 'var(--sf-primary-light)' }} />
      </div>
    </div>
  )
}

export default function StorefrontHomePage() {
  const { slug } = useParams()
  const [store, setStore] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      publicApi.get(`/store/${slug}/`),
      publicApi.get(`/store/${slug}/products/?per_page=8`),
    ]).then(([storeRes, prodRes]) => {
      setStore(storeRes.data)
      setProducts(prodRes.data.results || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [slug])

  return (
    <StorefrontLayout>
      {/* Hero */}
      <div className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--sf-hero-from) 0%, var(--sf-hero-via) 50%, var(--sf-hero-to) 100%)' }}>
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--sf-primary-light), transparent)', transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--sf-primary), transparent)', transform: 'translate(-30%, 30%)' }} />

        <div className="relative max-w-6xl mx-auto px-4 py-14 sm:py-20 flex flex-col sm:flex-row items-center gap-8 text-center sm:text-left">
          {store?.logo_url && (
            <img src={store.logo_url} alt={store.name}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shadow-2xl shadow-black/40 shrink-0" />
          )}
          <div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight mb-3">
              {store?.name ?? '…'}
            </h1>
            {store?.description && (
              <p className="text-white/70 text-base sm:text-lg max-w-xl leading-relaxed mb-6">{store.description}</p>
            )}
            <Link to={`/store/${slug}/products`}
              className="inline-flex items-center gap-2 bg-white font-bold px-7 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-black/20 hover:shadow-xl hover:scale-105"
              style={{ color: 'var(--sf-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--sf-primary-light)'}
              onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}>
              Voir tous les produits
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Produits */}
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--sf-text)' }}>Nouveautés</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--sf-text-muted)' }}>Les derniers produits disponibles</p>
          </div>
          <Link to={`/store/${slug}/products`}
            className="text-sm font-semibold flex items-center gap-1 transition-colors"
            style={{ color: 'var(--sf-primary)' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            Tout voir
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--sf-text-muted)' }}>
            <PackageIcon className="w-14 h-14 mb-4 opacity-30" />
            <p className="font-medium">Aucun produit disponible pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map(p => <ProductCard key={p.id} product={p} slug={slug} />)}
          </div>
        )}
      </div>
    </StorefrontLayout>
  )
}
