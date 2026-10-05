import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n'
import { theme } from '../theme'

// `variant="light"` pour la boutique publique (fond blanc), `dark` pour le dashboard.
export default function LanguageSwitcher({ variant = 'dark' }) {
  const { i18n } = useTranslation()
  const current = i18n.resolvedLanguage
  const light = variant === 'light'

  return (
    <div className="inline-flex gap-1" role="group" aria-label="Language">
      {SUPPORTED_LANGUAGES.map((l) => {
        const active = l.code === current
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => { if (!active) i18n.changeLanguage(l.code).then(() => window.location.reload()) }}
            aria-pressed={active}
            className={
              'text-xs px-2 py-0.5 rounded-md cursor-pointer transition-colors ' +
              (active
                ? 'bg-violet-600 text-white'
                : light
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'hover:bg-violet-500/10')
            }
            style={!active && !light ? { color: theme.dark.muted, background: theme.dark.cardAlt } : undefined}
          >
            {l.label}
          </button>
        )
      })}
    </div>
  )
}
