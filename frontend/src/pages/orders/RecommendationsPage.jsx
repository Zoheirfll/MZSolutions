import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function ExplainButton({ onExplain }) {
  const [explanation, setExplanation] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleClick = () => {
    setLoading(true)
    onExplain()
      .then(text => setExplanation(text))
      .catch(() => setExplanation('Explication indisponible pour le moment.'))
      .finally(() => setLoading(false))
  }

  if (explanation) return <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{explanation}</p>
  return (
    <button onClick={handleClick} disabled={loading} className="text-xs text-violet-400 hover:underline">
      {loading ? '…' : 'Pourquoi ce produit ?'}
    </button>
  )
}

export default function RecommendationsPage() {
  const [promote, setPromote] = useState([])
  const [trending, setTrending] = useState([])
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/products/recommendations/promote/'),
      api.get('/products/recommendations/trending/'),
      api.get('/products/recommendations/bundles/'),
    ]).then(([p, t, b]) => {
      setPromote(p.data.results || [])
      setTrending(t.data.results || [])
      setBundles(b.data.results || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const explainProduct = (productId, type) =>
    api.post(`/products/recommendations/${productId}/explain/?type=${type}`).then(({ data }) => data.explanation)

  const explainBundle = (idA, idB) =>
    api.post('/products/recommendations/bundle-explain/', { product_id_a: idA, product_id_b: idB }).then(({ data }) => data.explanation)

  return (
    <DashboardLayout title="Recommandations" subtitle="Suggestions calculées à partir de vos ventes réelles — à mettre en avant, en tendance, ou à proposer en bundle.">
      {loading ? <p className="text-sm text-app-muted">Chargement…</p> : (
        <div className="space-y-8">
          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">Produits à mettre en avant</h2>
            {promote.length === 0 ? <p className="text-sm text-app-muted">Aucun candidat pour le moment.</p> : (
              <div className="space-y-2">
                {promote.map(r => (
                  <div key={r.product_id} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name}</p>
                    <p className="text-xs text-app-muted-light">Marge {Math.round(r.margin_pct * 100)}% · Stock {r.total_stock} · {r.sales_rate_14d}/jour</p>
                    <ExplainButton onExplain={() => explainProduct(r.product_id, 'promote')} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">Produits en tendance</h2>
            {trending.length === 0 ? <p className="text-sm text-app-muted">Aucun produit en tendance pour le moment.</p> : (
              <div className="space-y-2">
                {trending.map(r => (
                  <div key={r.product_id} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name}</p>
                    <p className="text-xs text-app-muted-light">{r.prior_rate}/jour → {r.recent_rate}/jour (+{r.growth})</p>
                    <ExplainButton onExplain={() => explainProduct(r.product_id, 'trending')} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">Associations de vente croisée</h2>
            {bundles.length === 0 ? <p className="text-sm text-app-muted">Aucune association détectée pour le moment.</p> : (
              <div className="space-y-2">
                {bundles.map(r => (
                  <div key={`${r.product_id_a}-${r.product_id_b}`} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name_a} + {r.product_name_b}</p>
                    <p className="text-xs text-app-muted-light">Achetés ensemble {r.count} fois</p>
                    <ExplainButton onExplain={() => explainBundle(r.product_id_a, r.product_id_b)} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardLayout>
  )
}
