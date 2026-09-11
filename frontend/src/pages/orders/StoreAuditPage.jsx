import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className={theme.badge.neutral}>—</span>
  if (score < 50) return <span className={theme.badge.danger}>{score}</span>
  if (score < 75) return <span className={theme.badge.warning}>{score}</span>
  return <span className={theme.badge.success}>{score}</span>
}

const DIMENSION_CARDS = [
  { key: 'catalogue_score', label: 'Catalogue', link: '/dashboard/produits' },
  { key: 'logistics_score', label: 'Confirmation & logistique', link: '/dashboard/commandes' },
  { key: 'stock_score', label: 'Stock', link: '/dashboard/stock' },
  { key: 'returns_risk_score', label: 'Retours & clients à risque', link: '/dashboard/clients/risque' },
]

export default function StoreAuditPage() {
  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    api.get('/stores/me/audit/')
      .then(({ data }) => setAudit(data))
      .catch(() => setAudit(null))
      .finally(() => setLoading(false))
  }, [])

  const runAudit = () => {
    setAnalyzing(true)
    api.post('/stores/me/audit/')
      .then(({ data }) => setAudit(data))
      .catch(() => {})
      .finally(() => setAnalyzing(false))
  }

  return (
    <DashboardLayout title="Audit de la boutique" subtitle="Score calculé à partir de vos données réelles (catalogue, logistique, stock, retours) — synthèse rédigée par IA à partir de ces chiffres, jamais inventée.">
      {loading ? <p className="text-sm text-app-muted">Chargement…</p> : !audit ? (
        <div className="rounded-xl border p-8 text-center" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-sm text-app-muted mb-4">Aucun audit n'a encore été réalisé pour cette boutique.</p>
          <button onClick={runAudit} disabled={analyzing} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
            {analyzing ? 'Analyse en cours…' : 'Analyser ma boutique'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border p-6 flex items-center justify-between" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div>
              <p className="text-xs text-app-muted mb-1">Score global</p>
              <p className="text-3xl font-bold text-app-primary">{audit.global_score ?? '—'}</p>
            </div>
            <button onClick={runAudit} disabled={analyzing} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {analyzing ? 'Analyse en cours…' : 'Réanalyser'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DIMENSION_CARDS.map(c => (
              <a key={c.key} href={c.link} className="rounded-xl border p-4 block hover:bg-violet-500/5 transition" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <p className="text-xs text-app-muted mb-2">{c.label}</p>
                <ScoreBadge score={audit[c.key]} />
              </a>
            ))}
          </div>

          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-app-primary mb-2">Synthèse</h3>
            {audit.ai_unavailable ? (
              <p className="text-sm text-app-muted">Synthèse indisponible pour le moment — réessayez plus tard.</p>
            ) : (
              <p className="text-sm text-app-muted-light whitespace-pre-line">{audit.synthesis}</p>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
