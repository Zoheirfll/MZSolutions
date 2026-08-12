import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'

const PAGE_TYPE_LABELS = {
  about: 'À propos', faq: 'FAQ', terms: 'Conditions', custom: 'Libre',
}

const PAGE_TYPE_BADGES = {
  about: theme.badge.info, faq: theme.badge.cyan, terms: theme.badge.warning, custom: theme.badge.neutral,
}

export default function PagesPage() {
  const { user } = useAuth()
  const [pages,   setPages]   = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/stores/pages/').then(({ data }) => setPages(data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const remove = async (id) => {
    if (!confirm('Supprimer cette page ?')) return
    setDeleting(id)
    try {
      const { data } = await api.delete(`/stores/pages/${id}/`)
      if (data?.menu_links_removed) {
        alert(`Page supprimée. ${data.menu_links_removed} lien(s) pointant vers cette page ont aussi été retirés du menu de la boutique.`)
      }
    } catch {}
    setDeleting(null)
    load()
  }

  return (
    <DashboardLayout title="Pages personnalisées">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: theme.dark.muted }}>
          Créez des pages statiques visibles sur votre boutique (À propos, FAQ, CGV…)
        </p>
        <Link to="/dashboard/boutique/pages/nouvelle" className={theme.btn.primary}>
          + Nouvelle page
        </Link>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: theme.dark.card, borderBottom: `1px solid ${theme.dark.border}` }}>
              {['Titre', 'Type', 'Slug', 'Statut', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-app-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${theme.dark.border}` }}>
                  {[...Array(5)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className={`h-3 rounded w-24 ${theme.skeleton}`} />
                    </td>
                  ))}
                </tr>
              ))
            ) : pages.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center" style={{ color: theme.dark.muted }}>
                  Aucune page. Créez votre première page personnalisée.
                </td>
              </tr>
            ) : pages.map(page => (
              <tr key={page.id}
                style={{ borderBottom: `1px solid ${theme.dark.border}`, background: theme.dark.app }}
                onMouseEnter={e => e.currentTarget.style.background = theme.dark.card}
                onMouseLeave={e => e.currentTarget.style.background = theme.dark.app}>
                <td className="px-4 py-3 font-medium text-app-primary">{page.title}</td>
                <td className="px-4 py-3">
                  <span className={PAGE_TYPE_BADGES[page.page_type] || theme.badge.neutral}>
                    {PAGE_TYPE_LABELS[page.page_type] || page.page_type}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-app-muted">/{page.slug}</td>
                <td className="px-4 py-3">
                  {page.is_published
                    ? <span className={theme.badge.success}>Publiée</span>
                    : <span className={theme.badge.neutral}>Brouillon</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {page.is_published && user?.store_slug && (
                      <a href={`/store/${user.store_slug}/pages/${page.slug}`} target="_blank" rel="noreferrer"
                        className="text-xs px-3 py-1 rounded-lg border transition-colors cursor-pointer"
                        style={{ color: theme.dark.mutedLight, borderColor: theme.dark.border }}>
                        Aperçu
                      </a>
                    )}
                    <Link to={`/dashboard/boutique/pages/${page.id}/modifier`}
                      className="text-xs px-3 py-1 rounded-lg border transition-colors cursor-pointer"
                      style={{ color: theme.dark.mutedLight, borderColor: theme.dark.border }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.borderColor = '#7c3aed' }}
                      onMouseLeave={e => { e.currentTarget.style.color = theme.dark.mutedLight; e.currentTarget.style.borderColor = theme.dark.border }}>
                      Modifier
                    </Link>
                    <button onClick={() => remove(page.id)} disabled={deleting === page.id}
                      className="text-xs px-3 py-1 rounded-lg border transition-colors cursor-pointer"
                      style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}>
                      {deleting === page.id ? '…' : 'Supprimer'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
