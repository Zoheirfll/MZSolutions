import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import publicApi from '../../api/publicApi'
import { useCart } from '../../context/CartContext'
import { injectTheme, cleanupTheme } from '../../storefront-themes'
import { loadPixelScripts, trackEvent } from '../../lib/pixels'

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function CartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

export default function StorefrontLayout({ children, storeOverride }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { getCount } = useCart()
  const [store, setStore]     = useState(storeOverride || null)
  const [search, setSearch]   = useState('')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (storeOverride) {
      const t = storeOverride.theme || {}
      injectTheme(t.template || 'violet', t.primary || '', t.secondary || '', t.font || 'inter')
      return
    }
    publicApi.get(`/store/${slug}/`).then(({ data }) => {
      setStore(data)
      const t = data.theme || {}
      injectTheme(t.template || 'violet', t.primary || '', t.secondary || '', t.font || 'inter')
      loadPixelScripts(slug, data.pixels)
    }).catch(() => {})
    return () => cleanupTheme()
  }, [slug, storeOverride])

  // PageView (US-8.3.2) — à chaque navigation dans la boutique publique
  useEffect(() => {
    if (store) trackEvent('PageView', { page_path: location.pathname })
  }, [location.pathname, store])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleSearch = e => {
    e.preventDefault()
    navigate(`/store/${slug}/products?search=${encodeURIComponent(search)}`)
  }

  const cartCount = getCount(slug)

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--sf-body-bg)', color: 'var(--sf-text)', fontFamily: 'var(--sf-font-family, inherit)' }}>

      {/* Header */}
      <header className={`sticky top-0 z-30 transition-all duration-200 ${scrolled ? 'shadow-md' : ''}`}
        style={{ background: 'var(--sf-header-bg)', borderBottom: `1px solid var(--sf-header-border)`, color: 'var(--sf-header-text)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 sm:gap-4">

          {/* Logo */}
          <Link to={`/store/${slug}`} className="flex items-center gap-2.5 shrink-0 min-w-0">
            {store?.logo_url
              ? <img src={store.logo_url} alt={store.name} className="h-9 w-9 rounded-xl object-cover shrink-0" style={{ boxShadow: '0 0 0 2px var(--sf-primary-light)' }} />
              : <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--sf-primary-dark), var(--sf-primary))' }}>
                  {store?.name?.[0] ?? '?'}
                </div>
            }
            <span className="font-bold text-base truncate hidden sm:inline" style={{ color: 'var(--sf-header-text)' }}>
              {store?.name ?? '…'}
            </span>
          </Link>

          {/* Recherche */}
          <form onSubmit={handleSearch} className="flex-1 max-w-lg min-w-0">
            <div className="relative">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un produit…"
                className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: 'color-mix(in srgb, var(--sf-header-text) 8%, transparent)',
                  border: '1px solid transparent',
                  color: 'var(--sf-header-text)',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--sf-primary)'; e.target.style.background = 'var(--sf-card-bg)' }}
                onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'color-mix(in srgb, var(--sf-header-text) 8%, transparent)' }}
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                style={{ color: 'var(--sf-text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--sf-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--sf-text-muted)'}>
                <SearchIcon className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Nav */}
          <nav className="flex items-center gap-1 shrink-0">
            {(store?.menu_items?.length > 0
              ? store.menu_items.map(item => ({
                  to: (item.url || '').replace('{slug}', slug),
                  label: item.label,
                  external: item.type === 'external',
                }))
              : [{ to: `/store/${slug}`, label: 'Accueil' }, { to: `/store/${slug}/products`, label: 'Produits' }]
            ).map(({ to, label, external }) => (
              external
                ? <a key={to} href={to} target="_blank" rel="noreferrer"
                    className="hidden sm:inline-block px-3 py-1.5 text-sm rounded-lg transition-all duration-150 font-medium"
                    style={{ color: 'var(--sf-text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--sf-primary)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--sf-primary) 10%, transparent)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--sf-text-muted)'; e.currentTarget.style.background = 'transparent' }}>
                    {label}
                  </a>
                : <Link key={to} to={to}
                    className="hidden sm:inline-block px-3 py-1.5 text-sm rounded-lg transition-all duration-150 font-medium"
                    style={{ color: 'var(--sf-text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--sf-primary)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--sf-primary) 10%, transparent)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--sf-text-muted)'; e.currentTarget.style.background = 'transparent' }}>
                    {label}
                  </Link>
            ))}
            <Link to={`/store/${slug}/checkout`} aria-label="Panier"
              className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl transition-all duration-150 cursor-pointer"
              style={{ color: 'var(--sf-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--sf-primary) 10%, transparent)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <CartIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Panier</span>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm"
                  style={{ background: 'var(--sf-primary)' }}>
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t py-8 mt-12" style={{ background: 'var(--sf-footer-bg)', borderColor: 'var(--sf-footer-border)' }}>
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm" style={{ color: 'var(--sf-text-muted)' }}>
            © {new Date().getFullYear()} <span className="font-semibold" style={{ color: 'var(--sf-text)' }}>{store?.name}</span>.
            Propulsé par{' '}
            <span className="font-semibold" style={{ color: 'var(--sf-primary)' }}>MZSolutions</span>.
          </p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <Link to={`/store/${slug}/reclamation`} className="text-xs hover:underline"
              style={{ color: 'var(--sf-text-muted)' }}>
              Déposer une réclamation
            </Link>
            <Link to={`/store/${slug}/echange`} className="text-xs hover:underline"
              style={{ color: 'var(--sf-text-muted)' }}>
              Demander un échange
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
