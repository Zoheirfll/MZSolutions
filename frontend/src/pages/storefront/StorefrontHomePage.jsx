import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
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

export default function StorefrontHomePage() {
  const { slug } = useParams()
  const [store,    setStore]    = useState(null)
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)

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
      <div className="bg-gradient-to-br from-violet-700 to-violet-500 text-white py-16 px-4">
        <div className="max-w-6xl mx-auto flex items-center gap-8">
          {store?.logo_url && (
            <img src={store.logo_url} alt={store.name} className="w-24 h-24 rounded-2xl object-cover shadow-lg shrink-0" />
          )}
          <div>
            <h1 className="text-4xl font-bold mb-2">{store?.name}</h1>
            {store?.description && <p className="text-violet-100 text-lg max-w-xl">{store.description}</p>}
            <Link to={`/store/${slug}/products`} className="mt-5 inline-block bg-white text-violet-700 font-semibold px-6 py-2.5 rounded-full hover:bg-violet-50 transition">
              Voir tous les produits →
            </Link>
          </div>
        </div>
      </div>

      {/* Produits récents */}
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Nouveautés</h2>
          <Link to={`/store/${slug}/products`} className="text-sm text-violet-600 hover:underline">Tout voir →</Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
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
          <p className="text-gray-400 text-center py-16">Aucun produit disponible.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map(p => <ProductCard key={p.id} product={p} slug={slug} />)}
          </div>
        )}
      </div>
    </StorefrontLayout>
  )
}
