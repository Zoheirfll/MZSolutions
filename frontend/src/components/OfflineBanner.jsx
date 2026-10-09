import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

// Bandeau global affiché dès que le navigateur perd la connexion, pour qu'un
// échec d'appel API ne ressemble pas à un bug de l'application.
export default function OfflineBanner() {
  const { t } = useTranslation('dashboard')
  const isOnline = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (isOnline) return null
  return (
    <div role="status" className="fixed top-0 inset-x-0 z-[100] bg-amber-600 text-white text-center text-sm font-medium py-2 px-4">
      {t('Vous êtes hors ligne. Vérifiez votre connexion internet.')}
    </div>
  )
}
