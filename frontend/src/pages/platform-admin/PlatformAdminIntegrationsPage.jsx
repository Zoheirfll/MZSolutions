import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import StatCard from '../../components/StatCard'

// Adoption des intégrations sur toute la plateforme : combien de boutiques utilisent
// chaque transporteur ou canal de vente. Jamais un identifiant ni un secret.
export default function PlatformAdminIntegrationsPage() {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => (
    api.get('/platform-admin/integrations/')
      .then(({ data: d }) => { setData(d); setError('') })
      .catch(() => setError(t('Impossible de charger les intégrations.')))
  ), [t])

  useEffect(() => { load() }, [load])

  const cols = (key) => [
    { key: 'label', label: key === 'carrier' ? t('Transporteur') : t('Canal'), render: (r) => <span className="font-medium">{r.label}</span> },
    { key: 'stores', label: t('Boutiques') },
    { key: 'active', label: t('Comptes actifs') },
  ]
  const rows = (list, key) => (list || []).map((r) => ({ ...r, id: r[key] }))

  return (
    <div>
      <AdminPageHeader pageKey="integrations" title={t('Intégrations')} subtitle={t('Transporteurs et canaux utilisés par les vendeurs')}
        help={t('Nombre de boutiques ayant connecté chaque transporteur ou canal de vente, et nombre de comptes actifs. Le détail d\'une boutique est visible sur sa fiche. Aucune clé API n\'est jamais affichée.')} />

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-xl">
          <StatCard label={t('Webhooks sortants')} value={data.webhooks.total} color="violet" />
          <StatCard label={t('Webhooks en échec')} value={data.webhooks.failing} color={data.webhooks.failing > 0 ? 'orange' : 'green'} />
        </div>
      )}

      <h2 className="text-sm font-semibold text-app-primary mb-3">{t('Transporteurs')}</h2>
      <AdminList columns={cols('carrier')} rows={rows(data?.carriers, 'carrier')} total={data?.carriers?.length || 0} page={1} perPage={100} loading={!data && !error} error={error} onRetry={load} />

      <h2 className="text-sm font-semibold text-app-primary mt-8 mb-3">{t('Canaux de vente')}</h2>
      <AdminList columns={cols('channel')} rows={rows(data?.channels, 'channel')} total={data?.channels?.length || 0} page={1} perPage={100} loading={!data && !error} error={error} onRetry={load} />
    </div>
  )
}
