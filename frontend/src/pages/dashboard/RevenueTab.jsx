import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, DollarSign, Megaphone, Route, PhoneCall, RotateCcw, Package, AlertCircle } from 'lucide-react'
import StatCard from '../../components/StatCard'
import { Spinner, money } from '../orders/stats/statsShared'
import api from '../../api/axios'
import { theme } from '../../theme'

const CARDS = [
  { key: 'profit',            label: 'Bénéfices',            color: 'violet', icon: Wallet },
  { key: 'revenue',           label: "Chiffre d'affaires",   color: 'green',  icon: DollarSign },
  { key: 'ads_cost',          label: 'Coût des publicités',  color: 'blue',   icon: Megaphone },
  { key: 'delivery_variance', label: 'Écarts de livraison',  color: 'orange', icon: Route },
  { key: 'confirmation_fees', label: 'Frais de confirmation', color: 'cyan',  icon: PhoneCall },
  { key: 'return_cost',       label: 'Coût de retour',       color: 'red',    icon: RotateCcw },
  { key: 'product_debts',     label: 'Dettes de produits',   color: 'orange', icon: Package },
  { key: 'other_debts',       label: 'Autres dettes',        color: 'red',    icon: AlertCircle },
]

export default function RevenueTab({ queryString }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/dashboard/revenue/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm" style={{ color: theme.dark.muted }}>Impossible de charger les statistiques.</p>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {CARDS.map(c => (
          <StatCard key={c.key} label={c.label} color={c.color} icon={c.icon} value={money(data[c.key])} />
        ))}
      </div>

      <div className="rounded-2xl border p-5 flex items-center justify-between gap-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <p className="text-sm" style={{ color: theme.dark.muted }}>
          Les écarts de livraison, frais de confirmation, coût de retour et autres dettes sont saisis manuellement — comme un coût opérationnel ou marketing.
        </p>
        <button onClick={() => navigate('/dashboard/finances/couts')} className={theme.btn.secondary + ' shrink-0'}>
          Gérer les coûts
        </button>
      </div>
    </div>
  )
}
