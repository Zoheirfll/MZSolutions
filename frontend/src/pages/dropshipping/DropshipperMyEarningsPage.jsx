import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'
import { theme } from '../../theme'

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">Chargement…</span>
    </div>
  )
}

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

export default function DropshipperMyEarningsPage() {
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
    return <DashboardLayout title="Mes commissions"><Spinner /></DashboardLayout>
  }

  return (
    <DashboardLayout title="Mes commissions">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>Total gagné</p>
          <p className="text-xl font-semibold text-gray-200">{money(detail.total_earned)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>Total payé</p>
          <p className="text-xl font-semibold text-gray-200">{money(detail.total_paid)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>Solde à recevoir</p>
          <p className={`text-xl font-semibold ${Number(detail.balance) > 0 ? 'text-amber-400' : 'text-gray-200'}`}>{money(detail.balance)}</p>
        </div>
      </div>

      <h2 className="font-semibold text-gray-200 mb-3">Historique des commissions</h2>
      <div className="rounded-xl border overflow-x-auto mb-6" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-140">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">COMMANDE</th>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">MONTANT</th>
              <th className="px-4 py-3 font-medium">DATE</th>
            </tr>
          </thead>
          <tbody>
            {detail.entries.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Aucune commission calculée pour l'instant — elle apparaît dès qu'une de vos commandes passe au statut « Livrée ».</td></tr>
            ) : detail.entries.map(e => (
              <tr key={e.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-300">#{e.order_id}</td>
                <td className="px-4 py-3 text-gray-400">{e.product_name}</td>
                <td className="px-4 py-3 text-gray-200">{money(e.amount)}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(e.created_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-semibold text-gray-200 mb-3">Historique des paiements reçus</h2>
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-140">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">MONTANT</th>
              <th className="px-4 py-3 font-medium">NOTE</th>
              <th className="px-4 py-3 font-medium">DATE</th>
            </tr>
          </thead>
          <tbody>
            {detail.payments.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">Aucun paiement reçu pour l'instant.</td></tr>
            ) : detail.payments.map(p => (
              <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200">{money(p.amount)}</td>
                <td className="px-4 py-3 text-gray-400">{p.note || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.paid_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
