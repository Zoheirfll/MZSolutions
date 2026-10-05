import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../api/axios'

const STORAGE_KEY = 'mz-dismissed-announcements'
const STYLES = {
  info: { background: 'rgba(139,92,246,0.10)', borderBottom: '1px solid rgba(139,92,246,0.25)' },
  warning: { background: 'rgba(245,158,11,0.10)', borderBottom: '1px solid rgba(245,158,11,0.30)' },
}

function readDismissed() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function writeDismissed(ids) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-50))) } catch { /* stockage indisponible */ }
}

// Bandeau des annonces de l'équipe MZSolutions (cible évaluée côté serveur).
// Texte brut uniquement (jamais de HTML). « Fermer » est mémorisé par navigateur.
// Une erreur réseau est silencieuse : un bandeau ne doit jamais gêner le dashboard.
export default function AnnouncementBanner() {
  const { t } = useTranslation('dashboard')
  const [items, setItems] = useState([])
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    let alive = true
    // Promise.resolve().then(...) : un appel qui échoue (ou un mock de test sans réponse) ne casse jamais le rendu.
    Promise.resolve().then(() => api.get('/support/announcements/'))
      .then((res) => { if (alive) setItems(res?.data?.results || []) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const dismiss = (id) => {
    const next = [...dismissed, id]
    setDismissed(next)
    writeDismissed(next)
  }

  const visible = items.filter((a) => !dismissed.includes(a.id))
  if (visible.length === 0) return null
  return (
    <>
      {visible.map((a) => (
        <div key={a.id} role="status" className="flex items-start justify-between gap-3 px-5 sm:px-8 py-2.5 text-sm shrink-0" style={STYLES[a.level] || STYLES.info}>
          <p className="text-app-primary min-w-0 whitespace-pre-line"><strong>{a.title}</strong> — {a.body}</p>
          <button onClick={() => dismiss(a.id)} aria-label={t('Fermer')} className="shrink-0 text-app-muted-light hover:text-app-primary text-lg leading-none cursor-pointer">×</button>
        </div>
      ))}
    </>
  )
}
