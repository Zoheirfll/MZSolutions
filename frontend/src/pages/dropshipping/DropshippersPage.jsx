import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-8 0" />
    </svg>
  )
}

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

function EmptyState({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-gray-500">
      <div className="mb-3 text-gray-600"><UsersIcon width={28} height={28} /></div>
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{subtitle}</p>}
    </div>
  )
}

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

export default function DropshippersPage() {
  const navigate = useNavigate()
  const [dropshippers, setDropshippers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dropshipping/dropshippers/')
      .then(({ data }) => setDropshippers(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <DashboardLayout title="Dropshipping">
      <p className="text-sm mb-5" style={{ color: theme.dark.muted }}>
        {dropshippers.length} dropshipper{dropshippers.length !== 1 ? 's' : ''} actif{dropshippers.length !== 1 ? 's' : ''}
      </p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">DROPSHIPPER</th>
              <th className="px-4 py-3 font-medium">PRODUITS SÉLECTIONNÉS</th>
              <th className="px-4 py-3 font-medium">TOTAL GAGNÉ</th>
              <th className="px-4 py-3 font-medium">TOTAL PAYÉ</th>
              <th className="px-4 py-3 font-medium">SOLDE À PAYER</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><Spinner /></td></tr>
            ) : dropshippers.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState title="Aucun dropshipper" subtitle="Invitez un membre d'équipe avec le rôle Dropshipper depuis la page Équipe." />
              </td></tr>
            ) : dropshippers.map(d => (
              <tr key={d.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-gray-200">{d.first_name} {d.last_name}<br /><span className="text-xs text-gray-500">{d.email}</span></td>
                <td className="px-4 py-3 text-gray-400">{d.products_count}</td>
                <td className="px-4 py-3 text-gray-300">{money(d.total_earned)}</td>
                <td className="px-4 py-3 text-gray-400">{money(d.total_paid)}</td>
                <td className="px-4 py-3">
                  <span className={Number(d.balance) > 0 ? theme.badge.warning : theme.badge.neutral}>{money(d.balance)}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => navigate(`/dashboard/dropshipping/${d.id}`)}
                    className="px-3 py-1.5 rounded-lg text-xs border text-violet-300 hover:bg-white/5 transition cursor-pointer"
                    style={{ borderColor: theme.dark.border }}>
                    Gérer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
