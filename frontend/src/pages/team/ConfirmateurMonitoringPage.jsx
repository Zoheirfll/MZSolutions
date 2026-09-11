import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const FLAG_FILTER_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'with_flags', label: 'Avec alerte' },
  { value: 'without_flags', label: 'Sans alerte' },
]

const FLAG_LABELS = {
  inactive_online: 'En ligne mais inactif',
  high_late_ratio: 'Beaucoup de retards',
  high_cancellation: "Taux d'annulation élevé",
  low_throughput: 'Rythme très faible',
}

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className={theme.badge.neutral}>—</span>
  if (score < 50) return <span className={theme.badge.danger}>{score}</span>
  if (score < 75) return <span className={theme.badge.warning}>{score}</span>
  return <span className={theme.badge.success}>{score}</span>
}

function FlagBadges({ flags }) {
  if (!flags || flags.length === 0) return <span className={theme.badge.success}>RAS</span>
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map(f => <span key={f} className={theme.badge.warning}>{FLAG_LABELS[f] || f}</span>)}
    </div>
  )
}

function ConfirmateurRow({ row }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [explanation, setExplanation] = useState(null)
  const [loadingExplain, setLoadingExplain] = useState(false)

  const toggle = () => {
    setExpanded(e => !e)
    if (!detail) {
      api.get(`/team/monitoring/${row.member_id}/`).then(({ data }) => setDetail(data)).catch(() => {})
    }
  }

  const explain = () => {
    setLoadingExplain(true)
    api.post(`/team/monitoring/${row.member_id}/explain/`)
      .then(({ data }) => setExplanation(data.explanation))
      .catch(() => setExplanation('Explication indisponible pour le moment.'))
      .finally(() => setLoadingExplain(false))
  }

  return (
    <div className="rounded-xl border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <button onClick={toggle} className="w-full flex items-center justify-between p-4 cursor-pointer">
        <span className="text-sm font-medium text-app-primary">{row.name}</span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-app-muted">{row.orders_assigned} commande(s)</span>
          <FlagBadges flags={row.flags} />
          <ScoreBadge score={row.score} />
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t pt-4 space-y-3" style={{ borderColor: theme.dark.border }}>
          {!detail ? <p className="text-xs text-app-muted">Chargement…</p> : (
            <>
              <p className="text-xs text-app-muted-light">
                Taux de confirmation : {detail.confirmation_rate}% · Retards : {Math.round(detail.late_ratio * 100)}% ·
                Échec d'appel : {Math.round(detail.call_failure_rate * 100)}% · Annulation/retour : {detail.cancellation_return_rate}%
              </p>
              {explanation ? (
                <p className="text-xs text-app-muted-light">{explanation}</p>
              ) : (
                <button onClick={explain} disabled={loadingExplain} className="text-xs text-violet-400 hover:underline">
                  {loadingExplain ? '…' : 'Analyser'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ConfirmateurMonitoringPage() {
  const [overview, setOverview] = useState([])
  const [loading, setLoading] = useState(true)
  const [teamExplanation, setTeamExplanation] = useState(null)
  const [loadingTeamExplain, setLoadingTeamExplain] = useState(false)
  const [search, setSearch] = useState('')
  const [flagFilter, setFlagFilter] = useState('all')

  const filteredOverview = overview.filter(row => {
    if (search && !row.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (flagFilter === 'with_flags' && row.flags.length === 0) return false
    if (flagFilter === 'without_flags' && row.flags.length > 0) return false
    return true
  })

  useEffect(() => {
    api.get('/team/monitoring/')
      .then(({ data }) => setOverview(data.results || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const explainTeam = () => {
    setLoadingTeamExplain(true)
    api.post('/team/monitoring/team-explain/')
      .then(({ data }) => setTeamExplanation(data.explanation))
      .catch(() => setTeamExplanation('Explication indisponible pour le moment.'))
      .finally(() => setLoadingTeamExplain(false))
  }

  return (
    <DashboardLayout title="Suivi des confirmateurs" subtitle="Performance et signaux d'anomalie calculés sur les 30 derniers jours — synthèse IA rédigée à partir de ces chiffres, jamais inventée.">
      {loading ? <p className="text-sm text-app-muted">Chargement…</p> : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={explainTeam} disabled={loadingTeamExplain} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {loadingTeamExplain ? 'Analyse en cours…' : "Analyser l'équipe"}
            </button>
          </div>
          {teamExplanation && (
            <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <p className="text-sm text-app-muted-light">{teamExplanation}</p>
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un confirmateur…"
              className="flex-1 min-w-48 px-3.5 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition"
              style={{ background: theme.dark.card, borderColor: theme.dark.border }}
            />
            <div className="w-44">
              <Select value={flagFilter} onChange={setFlagFilter} options={FLAG_FILTER_OPTIONS} variant="dark"
                className="w-full px-3.5 py-2 rounded-lg text-sm text-app-primary border"
                style={{ background: theme.dark.card, borderColor: theme.dark.border }} />
            </div>
          </div>
          {filteredOverview.length === 0 ? (
            <p className="text-sm text-app-muted">Aucun confirmateur actif.</p>
          ) : (
            <div className="space-y-3">
              {filteredOverview.map(row => <ConfirmateurRow key={row.member_id} row={row} />)}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
