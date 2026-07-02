import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'

function ProductCard({ product, slug }) {
  return (
    <Link to={`/store/${slug}/products/${product.id}`}
      className="group border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-gray-100 overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">📦</div>
        }
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-violet-700 font-semibold">{Number(product.price).toLocaleString('fr-DZ')} DZD</span>
          {product.compare_price && (
            <span className="text-xs text-gray-400 line-through">{Number(product.compare_price).toLocaleString('fr-DZ')}</span>
          )}
        </div>
        {product.free_shipping && (
          <span className="text-xs text-emerald-600 mt-1 inline-block">✓ Livraison gratuite</span>
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

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-violet-500 transition'

  return (
    <StorefrontLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 flex gap-6">

        {/* Sidebar filtres */}
        <aside className="w-56 shrink-0 space-y-6">
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
            <div className="space-y-2">
              <input value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(1) }} type="number" min="0" placeholder="Min" className={inputCls} />
              <input value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1) }} type="number" min="0" placeholder="Max" className={inputCls} />
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
            <div className="grid grid-cols-3 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="border border-gray-200 rounded-xl overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-100" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-gray-400">Aucun produit trouvé.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {products.map(p => <ProductCard key={p.id} product={p} slug={slug} />)}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-30 hover:bg-gray-50">←</button>
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${page === i + 1 ? 'bg-violet-600 text-white border-violet-600' : 'hover:bg-gray-50'}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-30 hover:bg-gray-50">→</button>
            </div>
          )}
        </div>
      </div>
    </StorefrontLayout>
  )
}
