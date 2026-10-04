import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '../orders/stats/statsShared'
import EmptyState from '../../components/EmptyState'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useTranslation } from 'react-i18next'

function rateBadge(rate) {
  if (rate >= 70) return theme.badge.success
  if (rate >= 40) return theme.badge.warning
  return theme.badge.danger
}

export default function ConfirmationTab({ queryString }) {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/confirmation/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm" style={{ color: theme.dark.muted }}>{t('Impossible de charger les statistiques.')}</p>

  const byConfirmateur = data.by_confirmateur || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="rounded-2xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs font-medium mb-2" style={{ color: theme.dark.mutedLight }}>{t('Taux de confirmation global')}</p>
          <span className="text-4xl font-bold text-violet-400">{data.confirmation_rate}%</span>
        </div>
        <div className="rounded-2xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs font-medium mb-2" style={{ color: theme.dark.mutedLight }}>{t('Commandes traitées')}</p>
          <span className="text-4xl font-bold text-app-primary">{data.total_processed ?? '—'}</span>
        </div>
        <div className="rounded-2xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs font-medium mb-2" style={{ color: theme.dark.mutedLight }}>{t('Commandes confirmées')}</p>
          <span className="text-4xl font-bold text-emerald-400">{data.total_confirmed ?? '—'}</span>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <p className="text-sm font-semibold text-app-primary px-5 py-4 border-b" style={{ borderColor: theme.dark.border }}>{t('Par confirmateur')}</p>
        {byConfirmateur.length === 0 ? (
          <div className="p-8">
            <EmptyState title={t('Données insuffisantes')} description={t('Aucune commande assignée à un confirmateur sur cette période.')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-start text-xs" style={{ color: theme.dark.muted }}>
                  <th className="px-4 py-3 font-medium">{t('CONFIRMATEUR')}</th>
                  <th className="px-4 py-3 font-medium text-end">{t('TRAITÉES')}</th>
                  <th className="px-4 py-3 font-medium text-end">{t('CONFIRMÉES')}</th>
                  <th className="px-4 py-3 font-medium text-end">{t('SANS RÉPONSE')}</th>
                  <th className="px-4 py-3 font-medium text-end">{t('RETOUR')}</th>
                  <th className="px-4 py-3 font-medium text-end">{t('ANNULÉ')}</th>
                  <th className="px-4 py-3 font-medium text-end">{t('TAUX')}</th>
                </tr>
              </thead>
              <tbody>
                {byConfirmateur.map(c => (
                  <tr key={c.confirmateur_id} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary font-medium">{c.confirmateur_name}</td>
                    <td className="px-4 py-3 text-end text-app-muted-light">{c.processed}</td>
                    <td className="px-4 py-3 text-end text-app-muted-light">{c.confirmed}</td>
                    <td className="px-4 py-3 text-end text-app-muted-light">{c.no_answer}</td>
                    <td className="px-4 py-3 text-end text-app-muted-light">{c.returned}</td>
                    <td className="px-4 py-3 text-end text-app-muted-light">{c.cancelled}</td>
                    <td className="px-4 py-3 text-end"><span className={rateBadge(c.rate)}>{c.rate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button onClick={() => navigate('/dashboard/commandes/taux-confirmation')} className={theme.btn.secondary}>{t('Voir le détail complet (évolution jour par jour)')}</button>
    </div>
  )
}
