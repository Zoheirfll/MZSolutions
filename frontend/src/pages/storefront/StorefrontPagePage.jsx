import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'
import { sanitizeHtml } from '../../lib/sanitize'
import useDocumentMeta from '../../hooks/useDocumentMeta'

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

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

  useDocumentMeta(
    page?.meta_title || page?.title,
    page?.meta_description || stripHtml(page?.content).slice(0, 160),
  )

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
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }} />
          </>
        )}
      </div>
    </StorefrontLayout>
  )
}
