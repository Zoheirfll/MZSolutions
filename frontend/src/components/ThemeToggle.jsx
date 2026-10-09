import { useTranslation } from 'react-i18next'
import { Sun, Moon } from 'lucide-react'

// Bouton soleil/lune partagé par les pages publiques (landing, connexion).
// `mode` et `onToggle` viennent de useTheme().
export default function ThemeToggle({ mode, onToggle }) {
  const { t } = useTranslation('landing')
  const isDark = mode === 'dark'
  return (
    <button type="button" onClick={onToggle} aria-label={isDark ? t('nav.themeLight') : t('nav.themeDark')}
      className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-app-muted-light hover:text-app-primary hover:bg-violet-500/10 transition-colors cursor-pointer">
      {isDark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </button>
  )
}
