// Script ponctuel — extrait les tracés (id, name, d) du dz.svg (simplemaps.com,
// licence "Free for Commercial Use") en un module JS consommé par AlgeriaMap.jsx.
// Usage : node scripts/extract-algeria-map.mjs
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcPath = join(__dirname, '..', 'src', 'data', 'dz.svg')
const outPath = join(__dirname, '..', 'src', 'data', 'algeriaMapPaths.js')

const svg = readFileSync(srcPath, 'utf-8')

const pathRegex = /<path d="([^"]+)" id="([^"]+)" name="([^"]+)">/g
const paths = []
let match
while ((match = pathRegex.exec(svg)) !== null) {
  const [, d, id, name] = match
  paths.push({ id, name, d })
}

if (paths.length === 0) {
  console.error('Aucun tracé trouvé — vérifie le format du SVG source.')
  process.exit(1)
}

const header = `// Généré automatiquement depuis src/data/dz.svg par scripts/extract-algeria-map.mjs
// Source : simplemaps.com (Free for Commercial Use, https://simplemaps.com/resources/svg-license)
// Ne pas éditer à la main — relancer le script si dz.svg change.
`

const body = `export const ALGERIA_MAP_VIEWBOX = '0 0 1000 1000'\n\nexport const ALGERIA_WILAYA_PATHS = ${JSON.stringify(paths, null, 2)}\n`

writeFileSync(outPath, header + body, 'utf-8')
console.log(`${paths.length} tracés extraits -> ${outPath}`)
