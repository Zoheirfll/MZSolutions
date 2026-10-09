import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import useDocumentMeta from '../../hooks/useDocumentMeta'
import { useTheme } from '../../hooks/useTheme'
import LandingNav from './LandingNav'
import HeroSection from './HeroSection'
import FeaturesSection from './FeaturesSection'
import { CarriersAndStats, HowItWorks } from './ProofSection'
import FaqSection from './FaqSection'
import { FinalCta, LandingFooter, StickyMobileCta } from './LandingFooter'

export default function LandingPage() {
  const { t } = useTranslation('landing')
  const { user } = useAuth()
  const isLoggedIn = !!user
  const [pastHero, setPastHero] = useState(false)

  // Sans choix mémorisé, la landing suit la préférence du système.
  const systemTheme = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  const { theme: mode, toggleTheme } = useTheme(systemTheme)

  useDocumentMeta(t('meta.title'), t('meta.description'))

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > 640)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-dvh scroll-smooth bg-app text-app-primary">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-white">
        {t('nav.features')}
      </a>
      <LandingNav isLoggedIn={isLoggedIn} mode={mode} onToggleTheme={toggleTheme} />
      <main id="contenu">
        <HeroSection isLoggedIn={isLoggedIn} />
        <CarriersAndStats />
        <FeaturesSection />
        <HowItWorks />
        <FaqSection />
        <FinalCta isLoggedIn={isLoggedIn} />
      </main>
      <LandingFooter />
      <StickyMobileCta visible={pastHero} to={isLoggedIn ? '/dashboard' : '/auth?tab=register'} />
    </div>
  )
}
