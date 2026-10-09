import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, Inbox, PhoneCall, Truck, PackageCheck, Wallet } from 'lucide-react'
import { theme } from '../../theme'

const FLOW = [
  { id: 'received', Icon: Inbox },
  { id: 'confirmed', Icon: PhoneCall },
  { id: 'shipped', Icon: Truck },
  { id: 'delivered', Icon: PackageCheck },
  { id: 'collected', Icon: Wallet },
]

// Parcours réel d'une commande dans la plateforme — aucune donnée chiffrée :
// chaque étape correspond à une fonction existante.
function OrderFlow() {
  const { t } = useTranslation('landing')
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div aria-hidden="true" className="absolute -inset-6 rounded-[2rem] bg-violet-600/20 blur-3xl" />
      <div className="relative rounded-2xl border border-app bg-app-card p-5 sm:p-6 shadow-2xl">
        <p className="text-sm font-semibold text-app-primary">{t('hero.flowTitle')}</p>
        <ol className="mt-5">
          {FLOW.map(({ id, Icon }, i) => (
            <li key={id} className="relative flex gap-4 pb-6 last:pb-0">
              {i < FLOW.length - 1 && (
                <span aria-hidden="true" className="absolute start-5 top-10 bottom-0 w-px -translate-x-1/2 rtl:translate-x-1/2 bg-violet-500/30" />
              )}
              <span className="relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-app-accent ring-1 ring-inset ring-violet-500/25">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="font-semibold text-app-primary">{t(`hero.flow.${id}.title`)}</p>
                <p className="mt-0.5 text-sm text-app-muted-light">{t(`hero.flow.${id}.desc`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export default function HeroSection({ isLoggedIn }) {
  const { t } = useTranslation('landing')
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(124,58,237,0.22),transparent)]" />
      <div className="relative mx-auto max-w-6xl px-4 grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div className="text-center lg:text-start">
          <p className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-app-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />{t('hero.badge')}
          </p>
          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.1] tracking-tight text-app-primary text-balance">
            {t('hero.title')}
          </h1>
          <p className="mt-5 text-base sm:text-lg leading-relaxed text-app-muted-light max-w-xl mx-auto lg:mx-0">{t('hero.subtitle')}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <Link to={isLoggedIn ? '/dashboard' : '/auth?tab=register'} className={`${theme.btn.primary} px-6 py-3.5 text-base`}>
              {isLoggedIn ? t('nav.dashboard') : t('hero.primary')}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <a href="#fonctionnalites"
              className="inline-flex items-center justify-center rounded-lg border border-app px-6 py-3.5 text-base font-medium text-app-primary hover:bg-violet-500/10 transition-colors">
              {t('hero.secondary')}
            </a>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-app-muted-light">
            <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />{t('hero.trust')}
          </p>
        </div>
        <OrderFlow />
      </div>
    </section>
  )
}
