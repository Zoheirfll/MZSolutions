import { useTranslation } from 'react-i18next'
import { PhoneCall, Truck, ShieldAlert, Wallet, Store, Users, Boxes, Sparkles } from 'lucide-react'
import Reveal from './Reveal'

const FEATURES = [
  { id: 'confirmation', Icon: PhoneCall, span: 'lg:col-span-2' },
  { id: 'delivery', Icon: Truck },
  { id: 'returns', Icon: ShieldAlert },
  { id: 'payments', Icon: Wallet, span: 'lg:col-span-2' },
  { id: 'store', Icon: Store },
  { id: 'team', Icon: Users },
  { id: 'stock', Icon: Boxes },
  { id: 'ai', Icon: Sparkles, span: 'lg:col-span-3' },
]

export function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-app-accent">{eyebrow}</p>
      <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-app-primary text-balance">{title}</h2>
      {subtitle && <p className="mt-4 text-base sm:text-lg text-app-muted-light">{subtitle}</p>}
    </div>
  )
}

export default function FeaturesSection() {
  const { t } = useTranslation('landing')
  return (
    <section id="fonctionnalites" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <SectionHeading eyebrow={t('features.eyebrow')} title={t('features.title')} subtitle={t('features.subtitle')} />
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ id, Icon, span = '' }, i) => (
            <Reveal key={id} delay={(i % 4) * 60} className={span}>
              <article className="group h-full rounded-2xl border border-app bg-app-card p-6 transition-colors hover:border-violet-500/40">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/12 text-app-accent ring-1 ring-inset ring-violet-500/25">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-app-primary">{t(`features.${id}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-app-muted-light">{t(`features.${id}.desc`)}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
