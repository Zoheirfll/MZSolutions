import { useTranslation } from 'react-i18next'
import Reveal from './Reveal'
import { SectionHeading } from './FeaturesSection'

const CARRIERS = ['Yalidine', 'ZR Express', 'Noest', 'Maystro', 'Guepex', 'DHD', 'Ecotrack', 'Anderson', 'Navex', 'UPS', 'Zimou Express', 'Colireli']
const STATS = [
  { value: '30+', key: 'stats.carriers' },
  { value: '58', key: 'stats.wilayas' },
  { value: '2', key: 'stats.languages' },
  { value: '30', key: 'stats.trial' },
]
const STEPS = ['step1', 'step2', 'step3']

export function CarriersAndStats() {
  const { t } = useTranslation('landing')
  return (
    <section className="border-y border-app bg-app-sidebar py-12">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-center text-sm text-app-muted-light">{t('carriers.title')}</p>
        {/* 12 puces en grille : des rangées toujours complètes à chaque largeur
            (12 est divisible par 2, 3, 4 et 6), sans puce orpheline. */}
        <ul className="mx-auto mt-5 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {CARRIERS.map(name => (
            <li key={name} className="rounded-full border border-app bg-app-card px-3 py-1.5 text-center text-sm text-app-muted-light">{name}</li>
          ))}
        </ul>
        <dl className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
          {STATS.map(s => (
            <div key={s.key} className="text-center">
              <dt className="text-4xl font-extrabold text-app-primary tabular-nums">{s.value}</dt>
              <dd className="mt-1 text-sm text-app-muted-light">{t(s.key)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

export function HowItWorks() {
  const { t } = useTranslation('landing')
  return (
    <section id="comment-ca-marche" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal><SectionHeading eyebrow={t('how.eyebrow')} title={t('how.title')} /></Reveal>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step} delay={i * 80}>
              <li className="relative h-full rounded-2xl border border-app bg-app-card p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-base font-bold text-white">{i + 1}</span>
                <h3 className="mt-5 text-lg font-semibold text-app-primary">{t(`how.${step}Title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-app-muted-light">{t(`how.${step}Desc`)}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
