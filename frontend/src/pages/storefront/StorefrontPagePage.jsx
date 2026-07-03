import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'

export default function StorefrontPagePage() {
  const { slug, pageSlug } = useParams()
  const [page,    setPage]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    publicApi.get(`/store/${slug}/pages/${pageSlug}/`)
      .then(({ data }) => setPage(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [slug, pageSlug])

  return (
    <StorefrontLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 rounded-xl w-2/3" style={{ background: 'var(--sf-primary-light)' }} />
            <div className="h-4 rounded w-full" style={{ background: 'var(--sf-primary-light)' }} />
            <div className="h-4 rounded w-5/6" style={{ background: 'var(--sf-primary-light)' }} />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-lg font-semibold mb-2" style={{ color: 'var(--sf-text)' }}>Page introuvable</p>
            <Link to={`/store/${slug}`} className="text-sm font-medium" style={{ color: 'var(--sf-primary)' }}>
              ← Retour à l'accueil
            </Link>
          </div>
        ) : (
          <>
            <Link to={`/store/${slug}`} className="text-sm font-medium mb-6 inline-block transition-opacity hover:opacity-70"
              style={{ color: 'var(--sf-primary)' }}>
              ← Retour
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold mb-8 leading-tight" style={{ color: 'var(--sf-text)' }}>
              {page.title}
            </h1>
            {/* TipTap HTML output — styles inline for cross-theme compat */}
            <div className="sf-prose text-base leading-relaxed" style={{ color: 'var(--sf-text)' }}
              dangerouslySetInnerHTML={{ __html: page.content }} />
          </>
        )}
      </div>

      {/* Inline prose styles scoped to .sf-prose */}
      <style>{`
        .sf-prose h2 { font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.75rem; color: var(--sf-text); }
        .sf-prose h3 { font-size: 1.2rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: var(--sf-text); }
        .sf-prose p  { margin: 0.75rem 0; }
        .sf-prose ul { list-style: disc; padding-left: 1.5rem; margin: 0.75rem 0; }
        .sf-prose ol { list-style: decimal; padding-left: 1.5rem; margin: 0.75rem 0; }
        .sf-prose li { margin: 0.25rem 0; }
        .sf-prose a  { color: var(--sf-primary); text-decoration: underline; }
        .sf-prose strong { font-weight: 700; }
        .sf-prose em { font-style: italic; }
        .sf-prose blockquote { border-left: 3px solid var(--sf-primary); padding-left: 1rem; margin: 1rem 0; opacity: 0.8; font-style: italic; }
        .sf-prose hr { border: none; border-top: 1px solid var(--sf-footer-border); margin: 2rem 0; }
      `}</style>
    </StorefrontLayout>
  )
}
