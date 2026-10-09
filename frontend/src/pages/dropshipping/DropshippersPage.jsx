import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useTranslation } from 'react-i18next'
import { sfx } from '../../i18n'
import TableSkeleton from '../../components/TableSkeleton'

function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-8 0" />
    </svg>
  )
}

function EmptyState({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-app-muted">
      <div className="mb-3 text-app-muted"><UsersIcon width={28} height={28} /></div>
      <p className="text-sm font-medium text-app-primary">{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{subtitle}</p>}
    </div>
  )
}

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

export default function DropshippersPage() {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()
  const [dropshippers, setDropshippers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchDropshippers = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    api.get(`/dropshipping/dropshippers/?${params}`)
      .then(({ data }) => setDropshippers(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => { fetchDropshippers() }, [fetchDropshippers])

  return (
    <DashboardLayout title={t('Dropshipping')} subtitle={t('Un dropshipper est une personne qui vend vos produits pour vous (par exemple sur les réseaux sociaux) sans gérer de stock, et qui touche une commission sur chaque vente livrée. Cette page liste tous vos dropshippers actifs avec leur solde : combien ils ont gagné au total, combien vous leur avez déjà payé, et combien il vous reste à leur verser. Cliquez sur un dropshipper pour définir combien il touche par produit (un pourcentage ou un montant fixe) et pour consulter le détail de chacune de ses ventes.')}>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('Recherche par nom, email ou téléphone')}
          className="px-4 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition w-full sm:w-72"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
        <p className="text-sm" style={{ color: theme.dark.muted }}>{t('{{length}} dropshipper', { length: dropshippers.length })}{dropshippers.length !== 1 ? sfx('s') : ''}{' '}{t('actif')}{dropshippers.length !== 1 ? sfx('s') : ''}
        </p>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-220">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-start text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">{t('DROPSHIPPER')}</th>
              <th className="px-4 py-3 font-medium">{t('TÉLÉPHONE')}</th>
              <th className="px-4 py-3 font-medium">{t('WILAYA')}</th>
              <th className="px-4 py-3 font-medium">{t('PRODUITS SÉLECTIONNÉS')}</th>
              <th className="px-4 py-3 font-medium">{t('TOTAL GAGNÉ')}</th>
              <th className="px-4 py-3 font-medium">{t('TOTAL PAYÉ')}</th>
              <th className="px-4 py-3 font-medium">{t('SOLDE À PAYER')}</th>
              <th className="px-4 py-3 font-medium">{t('ACTIONS')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={6} cols={8} />
            ) : dropshippers.length === 0 ? (
              <tr><td colSpan={8}>
                <EmptyState title={t('Aucun dropshipper')} subtitle={t('Invitez un membre d\'équipe avec le rôle Dropshipper depuis la page Équipe.')} />
              </td></tr>
            ) : dropshippers.map(d => (
              <tr key={d.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary">{d.first_name} {d.last_name}<br /><span className="text-xs text-app-muted">{d.email}</span></td>
                <td className="px-4 py-3 text-app-muted-light font-mono text-xs">{d.phone || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{d.wilaya || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{d.products_count}</td>
                <td className="px-4 py-3 text-app-primary">{money(d.total_earned)}</td>
                <td className="px-4 py-3 text-app-muted-light">{money(d.total_paid)}</td>
                <td className="px-4 py-3">
                  <span className={Number(d.balance) > 0 ? theme.badge.warning : theme.badge.neutral}>{money(d.balance)}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => navigate(`/dashboard/dropshipping/${d.id}`)}
                    className="px-3 py-1.5 rounded-lg text-xs border text-violet-300 hover:bg-violet-500/5 transition cursor-pointer"
                    style={{ borderColor: theme.dark.border }}>{t('Gérer')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
