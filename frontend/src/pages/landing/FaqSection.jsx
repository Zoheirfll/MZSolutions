import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import Reveal from './Reveal'
import { SectionHeading } from './FeaturesSection'

const QUESTIONS = [1, 2, 3, 4, 5, 6]

// <details> natif : accessible au clavier et aux lecteurs d'écran sans JS.
export default function FaqSection() {
  const { t } = useTranslation('landing')
  return (
    <section id="faq" className="scroll-mt-20 border-t border-app bg-app-sidebar py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4">
        <Reveal><SectionHeading eyebrow={t('faq.eyebrow')} title={t('faq.title')} /></Reveal>
        <div className="mt-12 space-y-3">
          {QUESTIONS.map(n => (
            <details key={n} className="group rounded-xl border border-app bg-app-card open:border-violet-500/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-start font-medium text-app-primary [&::-webkit-details-marker]:hidden">
                {t(`faq.q${n}`)}
                <ChevronDown className="h-5 w-5 shrink-0 text-app-muted-light transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-app-muted-light">{t(`faq.a${n}`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
