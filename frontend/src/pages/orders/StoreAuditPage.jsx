import { useEffect, useState } from 'react'
import AIQuotaBadge from '../../components/AIQuotaBadge'
import { Link } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'
import { renderMarkdown } from '../../lib/markdown'
import { tt } from '../../i18n'
import { useTranslation } from 'react-i18next'

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className={theme.badge.neutral}>—</span>
  if (score < 50) return <span className={theme.badge.danger}>{score}</span>
  if (score < 75) return <span className={theme.badge.warning}>{score}</span>
  return <span className={theme.badge.success}>{score}</span>
}

function ProductList({ items, emptyLabel }) {
  const { t } = useTranslation('dashboard')
  if (!items || items.length === 0) return <p className="text-xs text-app-muted">{emptyLabel}</p>
  return (
    <ul className="space-y-1">
      {items.map(p => (
        <li key={p.id}>
          <Link to={`/dashboard/produits/${p.id}/modifier`} className="text-xs text-violet-400 hover:underline">
            {p.name}{p.stock !== undefined ? ` — ${tt('stock')} ${p.stock}` : ''}
            {p.price !== undefined ? t('— {{price}} DZD (coût {{cost_price}} DZD)', { price: p.price, cost_price: p.cost_price }) : ''}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function CatalogueDetail({ d }) {
  const { t } = useTranslation('dashboard')
  if (!d?.active_products) return <p className="text-xs text-app-muted">{t('Aucune donnée disponible.')}</p>
  return (
    <div className="space-y-4">
      <p className="text-xs text-app-muted">{t('{{active_products}} produit(s) actif(s) analysé(s).', { active_products: d.active_products })}</p>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('Sans image ({{pct_with_image}}% en ont une)', { pct_with_image: d.pct_with_image })}</p>
        <ProductList items={d.missing_image} emptyLabel={tt("Tous les produits ont une image.")} />
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('Sans description ({{pct_with_description}}% en ont une)', { pct_with_description: d.pct_with_description })}</p>
        <ProductList items={d.missing_description} emptyLabel={tt("Tous les produits ont une description.")} />
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('Sans prix d\'achat ({{pct_with_cost_price}}% en ont un)', { pct_with_cost_price: d.pct_with_cost_price })}</p>
        <ProductList items={d.missing_cost_price} emptyLabel={tt("Tous les produits ont un prix d'achat renseigné.")} />
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('Sans catégorie ({{pct_with_category}}% en ont une)', { pct_with_category: d.pct_with_category })}</p>
        <ProductList items={d.missing_category} emptyLabel={tt("Tous les produits ont une catégorie.")} />
      </div>
    </div>
  )
}

function LogisticsDetail({ d }) {
  const { t } = useTranslation('dashboard')
  if (!d?.orders) return <p className="text-xs text-app-muted">{t('Aucune commande sur les 30 derniers jours.')}</p>
  return (
    <div className="space-y-3">
      <p className="text-xs text-app-muted">{t('{{orders}} commande(s) sur 30 jours · {{confirmation_rate}}% confirmées · {{pending_total}} en attente', { orders: d.orders, confirmation_rate: d.confirmation_rate, pending_total: d.pending_total })}</p>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('Commandes en attente depuis plus de 24h ({{late_pending}})', { late_pending: d.late_pending })}</p>
        {d.late_orders?.length ? (
          <ul className="space-y-1">
            {d.late_orders.map(o => (
              <li key={o.id}>
                <Link to={`/dashboard/commandes/${o.id}`} className="text-xs text-violet-400 hover:underline">{t('Commande #{{id}} — {{phone}} — en attente depuis {{hours_late}}h', { id: o.id, phone: o.phone, hours_late: o.hours_late })}</Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-app-muted">{t('Aucune commande en retard.')}</p>}
      </div>
    </div>
  )
}

function StockDetail({ d }) {
  const { t } = useTranslation('dashboard')
  if (!d?.active_products) return <p className="text-xs text-app-muted">{t('Aucune donnée disponible.')}</p>
  return (
    <div className="space-y-4">
      <p className="text-xs text-app-muted">{t('{{active_products}} produit(s) actif(s) analysé(s).', { active_products: d.active_products })}</p>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('En rupture ({{out_of_stock}})', { out_of_stock: d.out_of_stock })}</p>
        <ProductList items={d.out_of_stock_products} emptyLabel={tt("Aucun produit en rupture.")} />
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('En stock bas ({{low_stock}})', { low_stock: d.low_stock })}</p>
        <ProductList items={d.low_stock_products} emptyLabel={tt("Aucun produit en stock bas.")} />
      </div>
    </div>
  )
}

function ReturnsRiskDetail({ d }) {
  const { t } = useTranslation('dashboard')
  if (!d || d.return_rate == null && !d.at_risk_customers && !d.products_at_loss) {
    return <p className="text-xs text-app-muted">{t('Aucune donnée disponible.')}</p>
  }
  return (
    <div className="space-y-4">
      {d.return_rate != null && <p className="text-xs text-app-muted">{t('Taux de retour sur 30 jours : {{return_rate}}%', { return_rate: d.return_rate })}</p>}
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('Clients à risque jamais traités (')}{d.untreated_at_risk_customers ?? 0}{' '}{t('sur')}{' '}{d.at_risk_customers ?? 0})
        </p>
        {d.untreated_customers?.length ? (
          <ul className="space-y-1">
            {d.untreated_customers.map(c => (
              <li key={c.phone}>
                <Link to="/dashboard/clients/risque" className="text-xs text-violet-400 hover:underline">{t('{{phone}} — {{risky_count}} commande(s) à risque', { phone: c.phone, risky_count: c.risky_count })}</Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-app-muted">{t('Aucun client à risque non traité.')}</p>}
      </div>
      <div>
        <p className="text-xs font-medium text-app-primary mb-1.5">{t('Produits vendus à perte (')}{d.products_at_loss ?? 0})</p>
        <ProductList items={d.at_loss_products} emptyLabel={tt("Aucun produit vendu à perte.")} />
      </div>
    </div>
  )
}

const DIMENSION_CARDS = [
  { key: 'catalogue_score', dimKey: 'catalogue', label: tt('Catalogue'), Detail: CatalogueDetail },
  { key: 'logistics_score', dimKey: 'logistics', label: tt('Confirmation & logistique'), Detail: LogisticsDetail },
  { key: 'stock_score', dimKey: 'stock', label: tt('Stock'), Detail: StockDetail },
  { key: 'returns_risk_score', dimKey: 'returns_risk', label: tt('Retours & clients à risque'), Detail: ReturnsRiskDetail },
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
  const { t } = useTranslation('dashboard')
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
    <DashboardLayout title={t('Audit de la boutique')} subtitle={t('Score calculé à partir de vos données réelles (catalogue, logistique, stock, retours) — synthèse rédigée par IA à partir de ces chiffres, jamais inventée.')}>
      {loading ? <p className="text-sm text-app-muted">{t('Chargement…')}</p> : !audit ? (
        <div className="rounded-xl border p-8 text-center" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-sm text-app-muted mb-4">{t('Aucun audit n\'a encore été réalisé pour cette boutique.')}</p>
          <AIQuotaBadge feature="audit" className="block mb-3" />
          <button onClick={runAudit} disabled={analyzing} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
            {analyzing ? t('Analyse en cours…') : t('Analyser ma boutique')}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border p-6 flex items-center justify-between" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div>
              <p className="text-xs text-app-muted mb-1">{t('Score global')}</p>
              <p className="text-3xl font-bold text-app-primary">{audit.global_score ?? '—'}</p>
            </div>
            <div className="flex items-center gap-3">
            <AIQuotaBadge feature="audit" />
            <button onClick={runAudit} disabled={analyzing} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {analyzing ? t('Analyse en cours…') : t('Réanalyser')}
            </button>
            </div>
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
            <h3 className="text-sm font-semibold text-app-primary mb-2">{t('Synthèse')}</h3>
            {audit.ai_unavailable ? (
              <p className="text-sm text-app-muted">{t('Synthèse indisponible pour le moment — réessayez plus tard.')}</p>
            ) : (
              <div className="ai-prose text-sm text-app-muted-light" dangerouslySetInnerHTML={{ __html: renderMarkdown(audit.synthesis) }} />
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
