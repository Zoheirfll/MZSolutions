import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import Logo from '../../components/Logo'
import Reveal from './Reveal'
import { theme } from '../../theme'

const CONTACT_EMAIL = 'mzsolutions31@gmail.com'

export function FinalCta({ isLoggedIn }) {
  const { t } = useTranslation('landing')
  return (
    <section className="py-20 sm:py-28">
      <Reveal className="mx-auto max-w-4xl px-4">
        <div className={`${theme.hero} rounded-3xl px-6 py-14 text-center sm:px-12`}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">{t('final.title')}</h2>
          <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg text-violet-100">{t('final.subtitle')}</p>
          <Link to={isLoggedIn ? '/dashboard' : '/auth?tab=register'}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-7 py-3.5 text-base font-semibold text-violet-800 hover:bg-violet-50 transition-colors">
            {isLoggedIn ? t('nav.dashboard') : t('final.cta')}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

export function LandingFooter() {
  const { t } = useTranslation('landing')
  return (
    <footer className="border-t border-app bg-app-sidebar pb-24 pt-12 md:pb-12">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <span className="flex items-center gap-2 text-app-accent"><Logo className="h-9 w-auto" /><span className="font-bold text-app-primary">MZSolutions</span></span>
          <p className="mt-3 max-w-xs text-sm text-app-muted-light">{t('footer.tagline')}</p>
        </div>
        <nav aria-label={t('footer.product')}>
          <p className="text-sm font-semibold text-app-primary">{t('footer.product')}</p>
          <ul className="mt-3 space-y-2 text-sm text-app-muted-light">
            <li><a href="#fonctionnalites" className="hover:text-app-primary">{t('nav.features')}</a></li>
            <li><a href="#comment-ca-marche" className="hover:text-app-primary">{t('nav.how')}</a></li>
            <li><a href="#faq" className="hover:text-app-primary">{t('nav.faq')}</a></li>
          </ul>
        </nav>
        <nav aria-label={t('footer.legal')}>
          <p className="text-sm font-semibold text-app-primary">{t('footer.legal')}</p>
          <ul className="mt-3 space-y-2 text-sm text-app-muted-light">
            <li><a href="/legal/terms/" className="hover:text-app-primary">{t('footer.terms')}</a></li>
            <li><a href="/legal/privacy-policy/" className="hover:text-app-primary">{t('footer.privacy')}</a></li>
            <li><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-app-primary">{CONTACT_EMAIL}</a></li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-app-muted">© {new Date().getFullYear()} MZSolutions. {t('footer.rights')}</p>
    </footer>
  )
}

// Barre d'action fixe sur mobile, affichée une fois le hero dépassé.
export function StickyMobileCta({ visible, to }) {
  const { t } = useTranslation('landing')
  return (
    <div className={`md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-app p-3 backdrop-blur transition-transform duration-300 ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      style={{ background: 'color-mix(in srgb, var(--bg-app) 95%, transparent)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <Link to={to} tabIndex={visible ? 0 : -1} className={`${theme.btn.primary} w-full py-3.5 text-base`}>{t('sticky.cta')}</Link>
    </div>
  )
}
