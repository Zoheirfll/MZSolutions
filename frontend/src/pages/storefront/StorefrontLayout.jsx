import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import publicApi from '../../api/publicApi'
import { useCart } from '../../context/CartContext'

export default function StorefrontLayout({ children }) {
  const { slug } = useParams()
  const navigate  = useNavigate()
  const { getCount } = useCart()
  const [store, setStore] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    publicApi.get(`/store/${slug}/`).then(({ data }) => setStore(data)).catch(() => {})
  }, [slug])

  const handleSearch = e => {
    e.preventDefault()
    navigate(`/store/${slug}/products?search=${encodeURIComponent(search)}`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-800">
      {/* Header */}
      <header className="border-b border-gray-200 sticky top-0 bg-white z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo + nom */}
          <Link to={`/store/${slug}`} className="flex items-center gap-2.5 shrink-0">
            {store?.logo_url
              ? <img src={store.logo_url} alt={store.name} className="h-9 w-9 rounded-lg object-cover" />
              : <div className="h-9 w-9 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-sm">
                  {store?.name?.[0] ?? '?'}
                </div>
            }
            <span className="font-semibold text-gray-900 text-lg">{store?.name ?? '…'}</span>
          </Link>

          {/* Recherche */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md">
            <div className="relative">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un produit…"
                className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:border-violet-500 transition"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-violet-600">
                🔍
              </button>
            </div>
          </form>

          {/* Nav */}
          <nav className="flex items-center gap-1 shrink-0">
            <Link to={`/store/${slug}`} className="px-3 py-1.5 text-sm text-gray-600 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition">
              Accueil
            </Link>
            <Link to={`/store/${slug}/products`} className="px-3 py-1.5 text-sm text-gray-600 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition">
              Produits
            </Link>
            <span className="px-3 py-1.5 text-sm text-gray-300 cursor-not-allowed">Suivi commande</span>
            <Link to={`/store/${slug}/checkout`} className="relative px-3 py-1.5 text-sm text-gray-600 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition">
              🛒 Panier
              {getCount(slug) > 0 && (
                <span className="absolute -top-1 -right-1 bg-violet-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {getCount(slug)}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </header>

      {/* Contenu */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 mt-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} {store?.name}. Propulsé par <span className="text-violet-600 font-medium">MZSolutions</span>.
        </div>
      </footer>
    </div>
  )
}
