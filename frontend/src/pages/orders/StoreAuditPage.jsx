import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'
import { renderMarkdown } from '../../lib/markdown'

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className={theme.badge.neutral}>—</span>
  if (score < 50) return <span className={theme.badge.danger}>{score}</span>
  if (score < 75) return <span className={theme.badge.warning}>{score}</span>
  return <span className={theme.badge.success}>{score}</span>
}

function ProductList({ items, emptyLabel }) {
  if (!items || items.length === 0) return <p className="text-xs text-app-muted">{emptyLabel}</p>
  return (
    <ul className="space-y-1">
      {items.map(p => (
        <li key={p.id}>
          <Link to={`/dashboard/produits/${p.id}/modifier`} className="text-xs text-violet-400 hover:underline">
            {p.name}{p.stock !== undefined ? ` — stock ${p.stock}` : ''}
            {p.price !== undefined ? ` — ${p.price} DZD (coût ${p.cost_price} DZD)` : ''}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function CatalogueDetail({ d }) {
  if (!d?.active_products) return <p className="text-xs text-app-muted">Aucune donnée disponible.</p>
  return (
    <div className="space-y-4">
      <p className="text-xs text-app-muted">{d.active_products} produit(s) actif(s) analysé(s).</p>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">Sans image ({d.pct_with_image}% en ont une)</p>
        <ProductList items={d.missing_image} emptyLabel="Tous les produits ont une image." />
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">Sans description ({d.pct_with_description}% en ont une)</p>
        <ProductList items={d.missing_description} emptyLabel="Tous les produits ont une description." />
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">Sans prix d'achat ({d.pct_with_cost_price}% en ont un)</p>
        <ProductList items={d.missing_cost_price} emptyLabel="Tous les produits ont un prix d'achat renseigné." />
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">Sans catégorie ({d.pct_with_category}% en ont une)</p>
        <ProductList items={d.missing_category} emptyLabel="Tous les produits ont une catégorie." />
      </div>
    </div>
  )
}

function LogisticsDetail({ d }) {
  if (!d?.orders) return <p className="text-xs text-app-muted">Aucune commande sur les 30 derniers jours.</p>
  return (
    <div className="space-y-3">
      <p className="text-xs text-app-muted">
        {d.orders} commande(s) sur 30 jours · {d.confirmation_rate}% confirmées · {d.pending_total} en attente
      </p>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">Commandes en attente depuis plus de 24h ({d.late_pending})</p>
        {d.late_orders?.length ? (
          <ul className="space-y-1">
            {d.late_orders.map(o => (
              <li key={o.id}>
                <Link to={`/dashboard/commandes/${o.id}`} className="text-xs text-violet-400 hover:underline">
                  Commande #{o.id} — {o.phone} — en attente depuis {o.hours_late}h
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-app-muted">Aucune commande en retard.</p>}
      </div>
    </div>
  )
}

function StockDetail({ d }) {
  if (!d?.active_products) return <p className="text-xs text-app-muted">Aucune donnée disponible.</p>
  return (
    <div className="space-y-4">
      <p className="text-xs text-app-muted">{d.active_products} produit(s) actif(s) analysé(s).</p>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">En rupture ({d.out_of_stock})</p>
        <ProductList items={d.out_of_stock_products} emptyLabel="Aucun produit en rupture." />
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">En stock bas ({d.low_stock})</p>
        <ProductList items={d.low_stock_products} emptyLabel="Aucun produit en stock bas." />
      </div>
    </div>
  )
}

function ReturnsRiskDetail({ d }) {
  if (!d || d.return_rate == null && !d.at_risk_customers && !d.products_at_loss) {
    return <p className="text-xs text-app-muted">Aucune donnée disponible.</p>
  }
  return (
    <div className="space-y-4">
      {d.return_rate != null && <p className="text-xs text-app-muted">Taux de retour sur 30 jours : {d.return_rate}%</p>}
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">
          Clients à risque jamais traités ({d.untreated_at_risk_customers ?? 0} sur {d.at_risk_customers ?? 0})
        </p>
        {d.untreated_customers?.length ? (
          <ul className="space-y-1">
            {d.untreated_customers.map(c => (
              <li key={c.phone}>
                <Link to="/dashboard/clients/risque" className="text-xs text-violet-400 hover:underline">
                  {c.phone} — {c.risky_count} commande(s) à risque
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-app-muted">Aucun client à risque non traité.</p>}
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">Produits vendus à perte ({d.products_at_loss ?? 0})</p>
        <ProductList items={d.at_loss_products} emptyLabel="Aucun produit vendu à perte." />
      </div>
    </div>
  )
}

const DIMENSION_CARDS = [
  { key: 'catalogue_score', dimKey: 'catalogue', label: 'Catalogue', Detail: CatalogueDetail },
  { key: 'logistics_score', dimKey: 'logistics', label: 'Confirmation & logistique', Detail: LogisticsDetail },
  { key: 'stock_score', dimKey: 'stock', label: 'Stock', Detail: StockDetail },
  { key: 'returns_risk_score', dimKey: 'returns_risk', label: 'Retours & clients à risque', Detail: ReturnsRiskDetail },
]

function DimensionSection({ card, audit, expanded, onToggle }) {
  const details = audit.details?.[card.dimKey]?.details
  const Detail = card.Detail
  return (
    <div className="rounded-xl border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 cursor-pointer">
        <span className="text-sm font-medium text-app-primary">{card.label}</span>
        <span className="flex items-center gap-2">
          <ScoreBadge score={audit[card.key]} />
          <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t pt-4" style={{ borderColor: theme.dark.border }}>
          <Detail d={details} />
        </div>
      )}
    </div>
  )
}

export default function StoreAuditPage() {
  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [expandedKey, setExpandedKey] = useState(null)

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

          <div className="space-y-3">
            {DIMENSION_CARDS.map(c => (
              <DimensionSection
                key={c.key} card={c} audit={audit}
                expanded={expandedKey === c.key}
                onToggle={() => setExpandedKey(k => k === c.key ? null : c.key)}
              />
            ))}
          </div>

          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-app-primary mb-2">Synthèse</h3>
            {audit.ai_unavailable ? (
              <p className="text-sm text-app-muted">Synthèse indisponible pour le moment — réessayez plus tard.</p>
            ) : (
              <div className="ai-prose text-sm text-app-muted-light" dangerouslySetInnerHTML={{ __html: renderMarkdown(audit.synthesis) }} />
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
