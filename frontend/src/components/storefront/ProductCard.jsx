import { Link } from 'react-router-dom'

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

export default function ProductCard({ product, slug }) {
  return (
    <Link to={`/store/${slug}/products/${product.slug || product.id}`}
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
