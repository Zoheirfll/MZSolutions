import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import { AdminError } from './AdminState'

// Historique complet d'une commande du dispatch : qui l'a appelée, quand, avec quel résultat,
// combien de temps elle a attendu, quand elle a été signalée ou mise en échec. Lecture seule —
// c'est l'explication de tout le processus demandée pour les commandes en échec.
const DOT = {
  created: 'bg-gray-400', assigned: 'bg-violet-400', attempt: 'bg-amber-400',
  requeued: 'bg-sky-400', escalated: 'bg-orange-500', failed: 'bg-red-500', done: 'bg-emerald-500',
}

export default function DispatchFlowModal({ orderId, onClose }) {
  const { t } = useTranslation('dashboard')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orderId) return
    setData(null); setError(null)
    api.get(`/platform-admin/dispatch/flows/${orderId}/`)
      .then(({ data: d }) => setData(d))
      .catch((err) => setError(err.response?.data?.detail || t('Impossible de charger l\'historique.')))
  }, [orderId, t])

  useEffect(() => {
    if (!orderId) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orderId, onClose])

  if (!orderId) return null
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl border p-5 shadow-xl" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="min-h-0 overflow-y-auto pe-1">
          <h2 className="text-base font-semibold text-app-primary">{t('Commande #{{id}}', { id: orderId })}</h2>
          {error && <div className="mt-3"><AdminError message={error} /></div>}
          {!error && !data && <p className="text-sm text-app-muted mt-3">{t('Chargement…')}</p>}
          {data && (
            <>
              <p className="text-sm text-app-muted-light mt-1">
                {data.store_name} · {data.customer} · {data.phone} · {data.wilaya}
              </p>
              <p className="text-xs text-app-muted mt-1">
                {t('{{n}} appel(s) sans réponse', { n: data.attempts })}
              </p>
              <ol className="mt-4 flex flex-col gap-3" data-testid="flow-timeline">
                {data.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[e.kind] || 'bg-gray-400'}`} />
                    <div>
                      <p className="text-sm text-app-primary">{e.explanation}</p>
                      <p className="text-xs text-app-muted">{new Date(e.at).toLocaleString('fr-DZ')}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <div className="flex justify-end mt-4 shrink-0">
          <button type="button" onClick={onClose} className={theme.btn.outline}>{t('Fermer')}</button>
        </div>
      </div>
    </div>
  )
}
