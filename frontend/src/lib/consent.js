// Consentement aux cookies de mesure/publicité (pixels marketing de la boutique
// publique). Choix mémorisé par navigateur ; localStorage peut être indisponible
// (navigation privée, stockage bloqué) → on retombe sur « pas de choix ».
const KEY = 'mz-cookie-consent'

export const CONSENT_ACCEPTED = 'accepted'
export const CONSENT_REFUSED = 'refused'

export function getConsent() {
  try {
    const value = localStorage.getItem(KEY)
    return value === CONSENT_ACCEPTED || value === CONSENT_REFUSED ? value : null
  } catch {
    return null
  }
}

export function setConsent(value) {
  try { localStorage.setItem(KEY, value) } catch { /* sans stockage, on redemandera */ }
}
