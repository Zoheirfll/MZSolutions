import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useTranslation } from 'react-i18next'

function ExplainButton({ onExplain }) {
  const { t: tr } = useTranslation('dashboard')
  const [explanation, setExplanation] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleClick = () => {
    setLoading(true)
    onExplain()
      .then(text => setExplanation(text))
      .catch(() => setExplanation(tr('Explication indisponible pour le moment.')))
      .finally(() => setLoading(false))
  }

  if (explanation) return <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{explanation}</p>
  return (
    <button onClick={handleClick} disabled={loading} className="text-xs text-violet-400 hover:underline">
      {loading ? '…' : tr('Pourquoi ce produit ?')}
    </button>
  )
}

export default function RecommendationsPage() {
  const { t: tr } = useTranslation('dashboard')
  const [promote, setPromote] = useState([])
  const [trending, setTrending] = useState([])
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

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

  const matches = name => (name || '').toLowerCase().includes(search.trim().toLowerCase())
  const filteredPromote = promote.filter(r => matches(r.product_name))
  const filteredTrending = trending.filter(r => matches(r.product_name))
  const filteredBundles = bundles.filter(r => matches(r.product_name_a) || matches(r.product_name_b))

  return (
    <DashboardLayout title={tr('Recommandations')} subtitle={tr('Suggestions calculées à partir de vos ventes réelles — à mettre en avant, en tendance, ou à proposer en bundle.')}>
      {loading ? <p className="text-sm text-app-muted">{tr('Chargement…')}</p> : (
        <div className="space-y-8">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tr('Rechercher un produit…')}
            className="w-full max-w-sm px-3.5 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          />

          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">{tr('Produits à mettre en avant')}</h2>
            {filteredPromote.length === 0 ? <p className="text-sm text-app-muted">{tr('Aucun candidat pour le moment.')}</p> : (
              <div className="space-y-2">
                {filteredPromote.map(r => (
                  <div key={r.product_id} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name}</p>
                    <p className="text-xs text-app-muted-light">{tr('Marge')}{' '}{Math.round(r.margin_pct * 100)}{tr('% · Stock {{total_stock}} · {{sales_rate_14d}}/jour', { total_stock: r.total_stock, sales_rate_14d: r.sales_rate_14d })}</p>
                    <ExplainButton onExplain={() => explainProduct(r.product_id, 'promote')} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">{tr('Produits en tendance')}</h2>
            {filteredTrending.length === 0 ? <p className="text-sm text-app-muted">{tr('Aucun produit en tendance pour le moment.')}</p> : (
              <div className="space-y-2">
                {filteredTrending.map(r => (
                  <div key={r.product_id} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name}</p>
                    <p className="text-xs text-app-muted-light">{tr('{{prior_rate}}/jour → {{recent_rate}}/jour (+{{growth}})', { prior_rate: r.prior_rate, recent_rate: r.recent_rate, growth: r.growth })}</p>
                    <ExplainButton onExplain={() => explainProduct(r.product_id, 'trending')} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">{tr('Associations de vente croisée')}</h2>
            {filteredBundles.length === 0 ? <p className="text-sm text-app-muted">{tr('Aucune association détectée pour le moment.')}</p> : (
              <div className="space-y-2">
                {filteredBundles.map(r => (
                  <div key={`${r.product_id_a}-${r.product_id_b}`} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name_a} + {r.product_name_b}</p>
                    <p className="text-xs text-app-muted-light">{tr('Achetés ensemble {{count}} fois', { count: r.count })}</p>
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
