import raw from './communes.json'

// Regroupe les communes par wilaya une seule fois au chargement du module
// (évite de refiltrer le tableau de ~1500 communes à chaque rendu de formulaire).
const BY_WILAYA_ID = raw.reduce((acc, c) => {
  const id = Number(c.wilaya_code)
  ;(acc[id] ??= []).push(c.commune_name_ascii)
  return acc
}, {})

Object.values(BY_WILAYA_ID).forEach(list => list.sort((a, b) => a.localeCompare(b, 'fr')))

/** Liste des noms de commune (triés) pour un id de wilaya (1-58) — [] si aucune trouvée. */
export function getCommunesForWilaya(wilayaId) {
  return BY_WILAYA_ID[Number(wilayaId)] || []
}
