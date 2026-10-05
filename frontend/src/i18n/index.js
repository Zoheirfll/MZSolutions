import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import frCommon from './locales/fr/common.json'
import arCommon from './locales/ar/common.json'
import frStorefront from './locales/fr/storefront.json'
import arStorefront from './locales/ar/storefront.json'
import frDashboard from './locales/fr/dashboard.json'
import arDashboard from './locales/ar/dashboard.json'

// Clés plates (« layout.home ») : keySeparator est désactivé pour que le
// dashboard puisse utiliser le texte français lui-même comme clé.
function flat(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flat(v, prefix + k + '.', out)
    else out[prefix + k] = v
  }
  return out
}

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
]

// Source unique du sens d'écriture : appliquée sur <html> à chaque changement
// de langue, ce qui active aussi les variantes Tailwind `rtl:` / `ltr:`.
export function applyDocumentLanguage(lng) {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === lng) || SUPPORTED_LANGUAGES[0]
  document.documentElement.lang = lang.code
  document.documentElement.dir = lang.dir
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: flat(frCommon), storefront: flat(frStorefront), dashboard: frDashboard },
      ar: { common: flat(arCommon), storefront: flat(arStorefront), dashboard: arDashboard },
    },
    initAsync: false, // chargement synchrone : tt() est appelé dès l'import des modules
    initImmediate: false,
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'ar'],
    nonExplicitSupportedLngs: true,
    defaultNS: 'common',
    ns: ['common', 'storefront', 'dashboard'],
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'mz-lang',
      caches: ['localStorage'],
    },
  })

applyDocumentLanguage(i18n.resolvedLanguage)
i18n.on('languageChanged', applyDocumentLanguage)

// Traduction hors composant (constantes de module, helpers). Évaluée à l'import :
// le changement de langue recharge donc la page (voir LanguageSwitcher).
export const tt = (key, options) => i18n.t(key, { ns: 'dashboard', ...options })

// Suffixe de pluriel français (« s », « x »…) : vide dans les autres langues,
// où le pluriel est porté par la traduction elle-même.
export const sfx = (suffix) => (i18n.resolvedLanguage === 'fr' ? suffix : '')

export default i18n
