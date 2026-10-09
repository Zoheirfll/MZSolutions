import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import AdminList from '../../components/admin/AdminList'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import DispatchFlowModal from '../../components/admin/DispatchFlowModal'

// Les trois pages du dispatch de l'opérateur du service de confirmation :
//   En attente d'assignation  → le pool, classé comme le moteur le servira (rang + note)
//   À traiter                 → commandes signalées après N appels sans réponse
//   Échecs                    → état définitif, lecture seule, avec tout l'historique
// Chacune lit la même forme de ligne (`/platform-admin/dispatch/<page>/`).
const PER_PAGE = 20
const REFRESH_MS = 30000

function useDispatchRows(endpoint, { poll }) {
  const { t } = useTranslation('dashboard')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback((silent = false) => {
    if (silent !== true) setLoading(true)
    api.get(`/platform-admin/dispatch/${endpoint}/`, { params: { page, per_page: PER_PAGE, search: search || undefined } })
      .then(({ data }) => { setRows(data.results.map((r) => ({ ...r, id: r.order_id }))); setTotal(data.count); setError(null) })
      .catch(() => setError(t('Impossible de charger les commandes.')))
      .finally(() => setLoading(false))
  }, [endpoint, page, search, t])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search])
  useEffect(() => {
    if (!poll) return undefined
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(true) }, REFRESH_MS)
    return () => clearInterval(id)
  }, [poll, load])

  return { rows, total, page, setPage, search, setSearch, loading, error, load }
}

function useColumns(kind) {
  const { t } = useTranslation('dashboard')
  const order = { key: 'order_id', label: t('Commande'), render: (r) => `#${r.order_id}` }
  const store = { key: 'store_name', label: t('Boutique') }
  const customer = { key: 'customer', label: t('Client'), render: (r) => (
    <span>{r.customer}<span className="block text-xs text-app-muted">{r.phone} · {r.wilaya}</span></span>) }
  const total = { key: 'total', label: t('Total'), render: (r) => t('{{total}} DA', { total: r.total }) }
  const attempts = { key: 'attempts', label: t('Appels'), render: (r) => (
    <span>{r.attempts}{r.last_outcome_label && <span className="block text-xs text-app-muted">{r.last_outcome_label}</span>}</span>) }

  if (kind === 'waiting') {
    return [
      { key: 'rank', label: t('Rang'), render: (r) => (
        <span title={t('Note {{score}} / 100', { score: r.score })} className={theme.badge.info}>{r.rank}</span>) },
      order, store, customer, total, attempts,
      { key: 'minutes_left', label: t('Prochaine assignation'), render: (r) => (
        r.ready ? <span className={theme.badge.success}>{t('Prête')}</span>
          : <span className={theme.badge.warning}>{t('Dans {{n}} min', { n: r.minutes_left })}</span>) },
    ]
  }
  if (kind === 'review') {
    return [order, store, customer, total, attempts,
      { key: 'state', label: t('État'), render: (r) => (r.state === 'assigned'
        ? t('Chez {{name}}', { name: r.confirmateur }) : t('En attente')) },
      { key: 'admin_flagged_at', label: t('Signalée le'), render: (r) => new Date(r.admin_flagged_at).toLocaleString('fr-DZ') }]
  }
  return [order, store, customer, total, attempts,
    { key: 'failed_at', label: t('Échec le'), render: (r) => <span className={theme.badge.danger}>{new Date(r.failed_at).toLocaleString('fr-DZ')}</span> }]
}

function DispatchListPage({ kind, endpoint, title, subtitle, help, poll }) {
  const { t } = useTranslation('dashboard')
  const data = useDispatchRows(endpoint, { poll })
  const columns = useColumns(kind)
  const [openOrder, setOpenOrder] = useState(null)
  const [running, setRunning] = useState(false)

  const runNow = async () => {
    setRunning(true)
    try { await api.post('/platform-admin/dispatch/run/') } finally { setRunning(false); data.load() }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <AdminPageHeader pageKey={`dispatch-${kind}`} title={title} subtitle={subtitle} help={help}
        actions={kind === 'waiting' && (
          <button onClick={runNow} disabled={running} className={theme.btn.outline}>
            {running ? t('Distribution…') : t('Distribuer maintenant')}
          </button>)} />
      <AdminList columns={columns} rows={data.rows} total={data.total} page={data.page} perPage={PER_PAGE}
        onPage={data.setPage} search={data.search} onSearch={data.setSearch} loading={data.loading}
        error={data.error} onRetry={data.load}
        rowActions={(r) => (
          <button onClick={() => setOpenOrder(r.order_id)} className={theme.btn.ghost}>{t('Historique')}</button>)} />
      <DispatchFlowModal orderId={openOrder} onClose={() => setOpenOrder(null)} />
    </div>
  )
}

export function DispatchWaitingPage() {
  const { t } = useTranslation('dashboard')
  return <DispatchListPage kind="waiting" endpoint="waiting" poll
    title={t('En attente d\'assignation')}
    subtitle={t('Commandes pas encore chez un confirmateur, dans l\'ordre où elles seront servies.')}
    help={t('Une commande arrive ici à sa création, puis après chaque appel sans réponse. Elle repart vers un autre confirmateur dès que son délai est écoulé (30, 40, 50 min… réglable) et qu\'un confirmateur a de la place. Le rang et la note viennent de l\'algorithme choisi pour la boutique.')} />
}

export function DispatchReviewPage() {
  const { t } = useTranslation('dashboard')
  return <DispatchListPage kind="review" endpoint="review" poll
    title={t('À traiter')}
    subtitle={t('Commandes signalées après plusieurs appels sans réponse.')}
    help={t('Une commande apparaît ici quand elle atteint le seuil d\'appels sans réponse. Elle continue d\'être redistribuée ; au-delà du second seuil elle passe en échec définitif.')} />
}

export function DispatchFailedPage() {
  const { t } = useTranslation('dashboard')
  return <DispatchListPage kind="failed" endpoint="failed"
    title={t('Échecs')}
    subtitle={t('Commandes que personne n\'a pu joindre — état définitif.')}
    help={t('Ces commandes ne sont plus proposées aux confirmateurs et restent « En attente » côté vendeur. Ouvrez l\'historique pour voir chaque appel : qui, quand, avec quel résultat.')} />
}
