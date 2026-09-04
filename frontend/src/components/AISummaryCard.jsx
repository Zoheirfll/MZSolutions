import { useState } from 'react'
import { theme } from '../theme'
import { getDashboardSummary } from '../api/aiApi'

export default function AISummaryCard({ tab, queryString }) {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getDashboardSummary(tab, queryString())
      setSummary(data.summary)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Assistant IA indisponible')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-app p-4 bg-app-card mb-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-app-primary">✨ Résumé IA</span>
        <button type="button" onClick={handleGenerate} disabled={loading}
          className={theme.btn.outline + ' text-xs py-1 px-2 disabled:opacity-50'}>
          {loading ? 'Analyse…' : summary ? 'Régénérer' : 'Générer'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {summary && <p className="text-sm text-app-muted mt-2">{summary}</p>}
    </div>
  )
}
