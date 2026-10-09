import { useTranslation } from 'react-i18next'

// Bannière de consentement de la boutique publique : tant que le visiteur n'a
// pas accepté, aucun pixel marketing (Facebook, TikTok, Google) n'est chargé.
export default function CookieBanner({ onAccept, onRefuse }) {
  const { t } = useTranslation('storefront')
  return (
    <div role="dialog" aria-label={t('cookies.title')}
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl border shadow-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        style={{ background: 'var(--sf-card-bg)', borderColor: 'var(--sf-header-border)', color: 'var(--sf-text)' }}>
        <p className="text-sm flex-1" style={{ color: 'var(--sf-text-muted)' }}>{t('cookies.message')}</p>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={onRefuse}
            className="px-4 py-2 text-sm font-medium rounded-lg border active:scale-95 transition"
            style={{ borderColor: 'var(--sf-header-border)', color: 'var(--sf-text)' }}>
            {t('cookies.refuse')}
          </button>
          <button type="button" onClick={onAccept}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-white active:scale-95 transition"
            style={{ background: 'var(--sf-primary)' }}>
            {t('cookies.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
