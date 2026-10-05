import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useTranslation } from 'react-i18next'

function Spinner() {
  const { t } = useTranslation('dashboard')
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-app-muted">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">{t('Chargement…')}</span>
    </div>
  )
}

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

export default function DropshipperMyEarningsPage() {
  const { t } = useTranslation('dashboard')
  const { user } = useAuth()
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.team_member_id) return
    api.get(`/dropshipping/dropshippers/${user.team_member_id}/`)
      .then(({ data }) => setDetail(data))
      .finally(() => setLoading(false))
  }, [user])

  if (loading || !detail) {
    return <DashboardLayout title={t('Mes commissions')} subtitle={t('Cette page vous montre, en tant que dropshipper, combien d\'argent vous avez gagné en commissions sur vos ventes, combien le vendeur vous a déjà payé, et combien il vous reste à recevoir. Vous ne pouvez rien modifier ici, c\'est juste pour suivre vos gains — vous verrez aussi le détail de chaque vente qui vous a rapporté une commission et chaque paiement déjà reçu.')}><Spinner /></DashboardLayout>
  }

  return (
    <DashboardLayout title={t('Mes commissions')} subtitle={t('Votre solde de commissions en lecture seule (gagné − déjà payé) ainsi que l\'historique détaillé de chaque commission générée et de chaque paiement reçu du vendeur.')}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>{t('Total gagné')}</p>
          <p className="text-xl font-semibold text-app-primary">{money(detail.total_earned)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>{t('Total payé')}</p>
          <p className="text-xl font-semibold text-app-primary">{money(detail.total_paid)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>{t('Solde à recevoir')}</p>
          <p className={`text-xl font-semibold ${Number(detail.balance) > 0 ? 'text-amber-400' : 'text-app-primary'}`}>{money(detail.balance)}</p>
        </div>
      </div>

      <h2 className="font-semibold text-app-primary mb-3">{t('Historique des commissions')}</h2>
      <div className="rounded-xl border overflow-x-auto mb-6" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-140">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-start text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">{t('COMMANDE')}</th>
              <th className="px-4 py-3 font-medium">{t('PRODUIT')}</th>
              <th className="px-4 py-3 font-medium">{t('MONTANT')}</th>
              <th className="px-4 py-3 font-medium">{t('DATE')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.entries.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-app-muted">{t('Aucune commission calculée pour l\'instant — elle apparaît dès qu\'une de vos commandes passe au statut « Livrée ».')}</td></tr>
            ) : detail.entries.map(e => (
              <tr key={e.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary">#{e.order_id}</td>
                <td className="px-4 py-3 text-app-muted-light">{e.product_name}</td>
                <td className="px-4 py-3 text-app-primary">{money(e.amount)}</td>
                <td className="px-4 py-3 text-app-muted text-xs">{new Date(e.created_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-semibold text-app-primary mb-3">{t('Historique des paiements reçus')}</h2>
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-140">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-start text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">{t('MONTANT')}</th>
              <th className="px-4 py-3 font-medium">{t('NOTE')}</th>
              <th className="px-4 py-3 font-medium">{t('DATE')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.payments.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-app-muted">{t('Aucun paiement reçu pour l\'instant.')}</td></tr>
            ) : detail.payments.map(p => (
              <tr key={p.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary">{money(p.amount)}</td>
                <td className="px-4 py-3 text-app-muted-light">{p.note || '—'}</td>
                <td className="px-4 py-3 text-app-muted text-xs">{new Date(p.paid_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
