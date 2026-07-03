import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'
import { theme } from '../../theme'

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

function ProductCard({ product, slug }) {
  return (
    <Link to={`/store/${slug}/products/${product.id}`}
      className={`group ${theme.card} ${theme.cardHover} overflow-hidden block`}>
      <div className="aspect-square bg-gray-100 overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300"><PackageIcon className="w-10 h-10" /></div>
        }
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-violet-700 font-semibold">{Number(product.price).toLocaleString('fr-DZ')} DZD</span>
          {product.original_price ? (
            <span className="text-xs text-gray-400 line-through">{Number(product.original_price).toLocaleString('fr-DZ')}</span>
          ) : product.compare_price && (
            <span className="text-xs text-gray-400 line-through">{Number(product.compare_price).toLocaleString('fr-DZ')}</span>
          )}
        </div>
        {product.free_shipping && (
          <span className={`${theme.badge.success} mt-2`}>
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

  return (
    <StorefrontLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">

        {/* Sidebar filtres */}
        <aside className="w-full md:w-56 shrink-0 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Catégories</h3>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="cat" checked={!category} onChange={() => { setCategory(''); setPage(1) }} className="accent-violet-600" />
                <span className="text-sm text-gray-700">Toutes</span>
              </label>
              {categories.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="cat" checked={category === String(c.id)} onChange={() => { setCategory(String(c.id)); setPage(1) }} className="accent-violet-600" />
                  <span className="text-sm text-gray-700">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Prix (DZD)</h3>
            <div className="flex md:flex-col gap-2">
              <input value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(1) }} type="number" min="0" placeholder="Min" className={theme.input} />
              <input value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1) }} type="number" min="0" placeholder="Max" className={theme.input} />
            </div>
            {(minPrice || maxPrice) && (
              <button onClick={() => { setMinPrice(''); setMaxPrice(''); setPage(1) }} className="mt-2 text-xs text-violet-600 hover:underline">
                Effacer les prix
              </button>
            )}
          </div>
        </aside>

        {/* Grille produits */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-gray-500">{total} produit{total !== 1 ? 's' : ''}</p>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className={`${theme.card} overflow-hidden`}>
                  <div className={`aspect-square ${theme.skeleton} rounded-none`} />
                  <div className="p-3 space-y-2">
                    <div className={`h-3 ${theme.skeleton} w-3/4`} />
                    <div className={`h-3 ${theme.skeleton} w-1/2`} />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className={theme.emptyState}>
              <SearchIcon className="w-12 h-12 text-gray-300 mb-3" />
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
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition ${page === i + 1 ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </StorefrontLayout>
  )
}
