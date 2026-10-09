import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useDocumentMeta from '../hooks/useDocumentMeta'

export default function NotFoundPage() {
  const { t } = useTranslation('dashboard')
  useDocumentMeta(t('Page introuvable') + ' — MZSolutions', t('Cette page n’existe pas ou a été déplacée.'), { robots: 'noindex,nofollow' })
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 bg-app text-app-primary">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold text-violet-500">404</p>
        <h1 className="mt-4 text-xl font-semibold">{t('Page introuvable')}</h1>
        <p className="mt-2 text-sm text-app-muted">{t('Cette page n’existe pas ou a été déplacée.')}</p>
        <Link to="/auth" className="mt-6 inline-block px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition active:scale-95">
          {t('Retour à l’accueil')}
        </Link>
      </div>
    </main>
  )
}
