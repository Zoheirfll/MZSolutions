import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

// Garde-fou anti-régression : chaque route /dashboard/* doit déclarer une
// permission explicite sur <PD perm="...">, sinon n'importe quel membre
// authentifié (confirmateur, dropshipper) peut y accéder en tapant l'URL,
// même si le lien est masqué dans la sidebar (DashboardLayout.jsx ne fait
// que de l'habillage visuel, jamais du contrôle d'accès).
// Faille réelle trouvée et corrigée en 2026-08 sur ~70 pages du dashboard —
// ce test empêche qu'une future page ajoutée sans `perm` la réintroduise.

const __dirname = dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(resolve(__dirname, '../App.jsx'), 'utf-8')

// Routes légitimement ouvertes à tout membre authentifié — profil personnel,
// pas de donnée boutique sensible. Toute autre route /dashboard/* doit
// porter perm=.
const NO_PERM_WHITELIST = [
  '/dashboard/parametres',
  '/dashboard/faq',
  '/dashboard/contact',
]

describe('App.jsx — routes du dashboard gatées par permission', () => {
  const routeLines = appSource
    .split('\n')
    .filter(line => /<Route path="\/dashboard/.test(line))

  it('a bien trouvé des routes /dashboard à vérifier (le test ne doit pas passer silencieusement à vide)', () => {
    expect(routeLines.length).toBeGreaterThan(30)
  })

  it.each(routeLines.map(line => {
    const pathMatch = line.match(/path="([^"]+)"/)
    return [pathMatch ? pathMatch[1] : line.trim(), line]
  }))('%s a un perm= (ou figure dans la whitelist)', (path, line) => {
    if (NO_PERM_WHITELIST.includes(path)) {
      expect(line).not.toMatch(/perm=/)
      return
    }
    expect(line).toMatch(/perm=/)
  })
})
