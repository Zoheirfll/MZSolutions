import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Menu, X } from 'lucide-react'
import ThemeToggle from '../../components/ThemeToggle'
import Logo from '../../components/Logo'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { theme } from '../../theme'

const LINKS = [
  { id: 'fonctionnalites', key: 'nav.features' },
  { id: 'comment-ca-marche', key: 'nav.how' },
  { id: 'faq', key: 'nav.faq' },
]

export default function LandingNav({ isLoggedIn, mode, onToggleTheme }) {
  const { t } = useTranslation('landing')
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const ctaTo = isLoggedIn ? '/dashboard' : '/auth?tab=register'
  const ctaLabel = isLoggedIn ? t('nav.dashboard') : t('nav.cta')

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-200 ${scrolled || open ? 'backdrop-blur border-b border-app' : 'bg-transparent'}`}
      style={scrolled || open ? { background: 'color-mix(in srgb, var(--bg-app) 90%, transparent)' } : undefined}>
      <nav aria-label="Navigation principale" className="mx-auto max-w-6xl h-16 px-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 text-app-accent" aria-label="MZSolutions">
          <Logo className="h-9 w-auto" />
          <span className="font-bold text-app-primary tracking-tight">MZSolutions</span>
        </Link>

        <ul className="hidden md:flex items-center gap-1">
          {LINKS.map(l => (
            <li key={l.id}>
              <a href={`#${l.id}`} className="px-3 py-2 rounded-lg text-sm text-app-muted-light hover:text-app-primary hover:bg-violet-500/10 transition-colors">{t(l.key)}</a>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle mode={mode} onToggle={onToggleTheme} />
          {!isLoggedIn && <Link to="/auth" className="px-3 py-2 text-sm text-app-muted-light hover:text-app-primary transition-colors">{t('nav.login')}</Link>}
          <Link to={ctaTo} className={`${theme.btn.primary} px-4 py-2`}>{ctaLabel}</Link>
        </div>

        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="landing-mobile-menu"
          aria-label={open ? t('nav.close') : t('nav.menu')}
          className="md:hidden h-11 w-11 -me-2 inline-flex items-center justify-center rounded-lg text-app-primary hover:bg-violet-500/10">
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </nav>

      {open && (
        <div id="landing-mobile-menu" className="md:hidden border-t border-app px-4 pb-5 pt-3 space-y-1">
          {LINKS.map(l => (
            <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)}
              className="block px-3 py-3 rounded-lg text-base text-app-primary hover:bg-violet-500/10">{t(l.key)}</a>
          ))}
          <div className="flex items-center justify-between pt-3">
            <span className="flex items-center gap-2"><LanguageSwitcher /><ThemeToggle mode={mode} onToggle={onToggleTheme} /></span>
            {!isLoggedIn && <Link to="/auth" className="px-3 py-2 text-sm text-app-muted-light">{t('nav.login')}</Link>}
          </div>
          <Link to={ctaTo} className={`${theme.btn.primary} w-full py-3 text-base`}>{ctaLabel}</Link>
        </div>
      )}
    </header>
  )
}
