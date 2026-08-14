import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'

function PackageIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
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

function ChevronLeft(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRight(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors'
const inputStyle = { background: 'var(--sf-card-bg)', border: '1px solid var(--sf-header-border)', color: 'var(--sf-text)' }

function ProductCard({ product, slug }) {
  return (
    <Link to={`/store/${slug}/products/${product.id}`}
      className="group rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-0.5 block"
      style={{ background: 'var(--sf-card-bg)', borderColor: 'color-mix(in srgb, var(--sf-primary) 15%, transparent)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--sf-primary) 40%, transparent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--sf-primary) 15%, transparent)' }}>
      {product.show_images !== false && (
        <div className="aspect-square overflow-hidden" style={{ background: 'var(--sf-primary-light)' }}>
          {product.image_url
            ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            : <div className="w-full h-full flex items-center justify-center opacity-30"><PackageIcon className="w-10 h-10" /></div>
          }
        </div>
      )}
      <div className="p-3">
        {product.show_title !== false && (
          <p className="text-sm font-medium truncate" style={{ color: 'var(--sf-text)' }}>{product.name}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="font-semibold" style={{ color: 'var(--sf-primary)' }}>{Number(product.price).toLocaleString('fr-DZ')} DZD</span>
          {product.original_price ? (
            <span className="text-xs line-through" style={{ color: 'var(--sf-text-muted)' }}>{Number(product.original_price).toLocaleString('fr-DZ')}</span>
          ) : product.compare_price && (
            <span className="text-xs line-through" style={{ color: 'var(--sf-text-muted)' }}>{Number(product.compare_price).toLocaleString('fr-DZ')}</span>
          )}
        </div>
        {product.free_shipping && (
          <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ring-emerald-400/40" style={{ background: 'rgba(16,185,129,0.14)', color: '#6ee7b7' }}>
            <TruckIcon className="w-3 h-3" /> Livraison gratuite
          </span>
        )}
      </div>
    </Link>
  )
}

export default function StorefrontProductsPage() {
  const { slug }                    = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const [categories, setCategories] = useState([])
  const [products,   setProducts]   = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)

  const [search,    setSearch]    = useState(searchParams.get('search') || '')
  const [category,  setCategory]  = useState(searchParams.get('category') || '')
  const [minPrice,  setMinPrice]  = useState(searchParams.get('min_price') || '')
  const [maxPrice,  setMaxPrice]  = useState(searchParams.get('max_price') || '')
  const [page,      setPage]      = useState(1)
  const PER_PAGE = 12

  useEffect(() => {
    publicApi.get(`/store/${slug}/categories/`).then(({ data }) => setCategories(data)).catch(() => {})
  }, [slug])

  const fetchProducts = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: PER_PAGE })
    if (search)   params.set('search', search)
    if (category) params.set('category', category)
    if (minPrice) params.set('min_price', minPrice)
    if (maxPrice) params.set('max_price', maxPrice)
    publicApi.get(`/store/${slug}/products/?${params}`)
      .then(({ data }) => { setProducts(data.results || []); setTotal(data.count || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug, search, category, minPrice, maxPrice, page])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const totalPages = Math.ceil(total / PER_PAGE)
  const pillCls = (active) => `px-3 py-1.5 rounded-lg text-sm border transition ${active ? 'text-white' : ''}`
  const pillStyle = (active) => active
    ? { background: 'var(--sf-primary)', borderColor: 'var(--sf-primary)' }
    : { borderColor: 'var(--sf-header-border)', color: 'var(--sf-text-muted)' }

  return (
    <StorefrontLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">

        {/* Sidebar filtres */}
        <aside className="w-full md:w-56 shrink-0 space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--sf-text-muted)' }}>Catégories</h3>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="cat" checked={!category} onChange={() => { setCategory(''); setPage(1) }} className="accent-violet-600" />
                <span className="text-sm" style={{ color: 'var(--sf-text)' }}>Toutes</span>
              </label>
              {categories.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="cat" checked={category === String(c.id)} onChange={() => { setCategory(String(c.id)); setPage(1) }} className="accent-violet-600" />
                  <span className="text-sm" style={{ color: 'var(--sf-text)' }}>{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--sf-text-muted)' }}>Prix (DZD)</h3>
            <div className="flex md:flex-col gap-2">
              <input value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(1) }} type="number" min="0" placeholder="Min" className={inputCls} style={inputStyle} />
              <input value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1) }} type="number" min="0" placeholder="Max" className={inputCls} style={inputStyle} />
            </div>
            {(minPrice || maxPrice) && (
              <button onClick={() => { setMinPrice(''); setMaxPrice(''); setPage(1) }} className="mt-2 text-xs hover:underline" style={{ color: 'var(--sf-primary)' }}>
                Effacer les prix
              </button>
            )}
          </div>
        </aside>

        {/* Grille produits */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm" style={{ color: 'var(--sf-text-muted)' }}>{total} produit{total !== 1 ? 's' : ''}</p>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border animate-pulse" style={{ background: 'var(--sf-card-bg)', borderColor: 'var(--sf-header-border)' }}>
                  <div className="aspect-square" style={{ background: 'var(--sf-primary-light)' }} />
                  <div className="p-3 space-y-2">
                    <div className="h-3 rounded w-3/4" style={{ background: 'var(--sf-primary-light)' }} />
                    <div className="h-3 rounded w-1/2" style={{ background: 'var(--sf-primary-light)' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6" style={{ color: 'var(--sf-text-muted)' }}>
              <SearchIcon className="w-12 h-12 mb-3 opacity-30" />
              <p>Aucun produit trouvé.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {products.map(p => <ProductCard key={p.id} product={p} slug={slug} />)}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border disabled:opacity-30 transition"
                style={{ borderColor: 'var(--sf-header-border)', color: 'var(--sf-text-muted)' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)} className={pillCls(page === i + 1)} style={pillStyle(page === i + 1)}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border disabled:opacity-30 transition"
                style={{ borderColor: 'var(--sf-header-border)', color: 'var(--sf-text-muted)' }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </StorefrontLayout>
  )
}
