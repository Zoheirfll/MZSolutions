import { useEffect, useState, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { Spinner } from './statsShared'

export default function ReturnsForecastPage() {
  const [horizon, setHorizon] = useState(7)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true)
    setError('')
    api.get(`/orders/stats/returns-forecast/?horizon_days=${horizon}`)
      .then(({ data }) => setData(data))
      .catch(e => {
        setData(null)
        setError(e?.response?.data?.detail || 'Impossible de calculer la prévision.')
      })
      .finally(() => setLoading(false))
  }, [horizon])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <DashboardLayout title="Prévision de taux de retour" subtitle="Estimation statistique du taux de retour sur les prochains jours, basée sur votre historique. Ajustez l'horizon avec le curseur.">
      <div className="rounded-xl border p-4 mb-5 text-sm text-app-muted-light" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        Estimation statistique basée sur votre historique — pas une garantie. Un retour prend du temps à se matérialiser : au moins 30 jours d'historique sont nécessaires pour une estimation fiable.
      </div>

      <div className="rounded-xl border p-5 mb-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-app-primary font-medium">Horizon : {horizon} jours</label>
        </div>
        <input type="range" min={7} max={60} value={horizon} role="slider"
          onChange={e => setHorizon(Number(e.target.value))}
          className="w-full accent-violet-600" />
      </div>

      {loading ? <Spinner /> : error ? (
        <p className="text-sm text-red-400 py-8 text-center">{error}</p>
      ) : data ? (
        <>
          <div className="rounded-xl border p-5 mb-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.points}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="rate_high" stroke="none" fill="#7c3aed" fillOpacity={0.08} name="Taux (haut)" />
                <Area type="monotone" dataKey="predicted_rate" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.2} name="Taux de retour prévu" />
                <Area type="monotone" dataKey="rate_low" stroke="none" fill="transparent" name="Taux (bas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <table className="w-full text-sm">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs" style={{ color: theme.dark.muted }}>
                  <th className="px-4 py-3 font-medium">DATE</th>
                  <th className="px-4 py-3 font-medium text-right">TAUX DE RETOUR PRÉVU</th>
                  <th className="px-4 py-3 font-medium text-right">FOURCHETTE</th>
                </tr>
              </thead>
              <tbody>
                {data.points.map(p => (
                  <tr key={p.date} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary">{p.date}</td>
                    <td className="px-4 py-3 text-right text-app-primary font-medium">{p.predicted_rate}%</td>
                    <td className="px-4 py-3 text-right text-app-muted-light">{p.rate_low}% – {p.rate_high}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </DashboardLayout>
  )
}
