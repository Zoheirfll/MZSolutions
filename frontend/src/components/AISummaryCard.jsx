import { useState } from 'react'
import AIQuotaBadge from '../components/AIQuotaBadge'
import { theme } from '../theme'
import { getDashboardSummary } from '../api/aiApi'
import { useTranslation } from 'react-i18next'

// Le dernier résumé reste affiché (même après changement d'onglet ou rechargement) jusqu'à ce
// que l'on demande une nouvelle analyse : seule une génération consomme le quota IA.
const storageKey = (tab) => `mz-ai-summary-${tab}`
const readSaved = (tab) => {
  try { return JSON.parse(localStorage.getItem(storageKey(tab)) || 'null') } catch { return null }
}

export default function AISummaryCard({ tab, queryString }) {
  const { t, t: tr } = useTranslation('dashboard')
  const [saved, setSaved] = useState(() => readSaved(tab))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const summary = saved?.summary || ''

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getDashboardSummary(tab, queryString())
      const next = { summary: data.summary, at: new Date().toISOString() }
      setSaved(next)
      try { localStorage.setItem(storageKey(tab), JSON.stringify(next)) } catch { /* stockage indisponible */ }
    } catch (e) {
      setError(e?.response?.data?.detail || t('Assistant IA indisponible'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-app p-4 bg-app-card mb-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-app-primary">{t('✨ Résumé IA')} <AIQuotaBadge feature="summary" className="ms-2 font-normal" /></span>
        <button type="button" onClick={handleGenerate} disabled={loading}
          className={theme.btn.outline + ' text-xs py-1 px-2 disabled:opacity-50'}>
          {loading ? tr('Analyse…') : summary ? t('Régénérer') : t('Générer')}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {summary && <p className="text-sm text-app-muted mt-2">{summary}</p>}
      {summary && saved?.at && <p className="text-xs text-app-muted-light mt-1">{t('Généré le')} {new Date(saved.at).toLocaleString('fr-DZ')}</p>}
    </div>
  )
}
