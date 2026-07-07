import { useMemo, useState } from 'react'
import { ALGERIA_MAP_VIEWBOX, ALGERIA_WILAYA_PATHS } from '../data/algeriaMapPaths'
import { theme } from '../theme'

// Le SVG source (simplemaps.com) contient 3 coquilles orthographiques dans les
// attributs `name` — alias vers le nom réel pour que la correspondance avec les
// noms de wilaya (accentués) saisis au checkout fonctionne malgré tout.
const NAME_ALIASES = {
  'bordj bou arreridj': 'bordj bou arrer',
  'bordj badji mokhtar': 'bordj baji mokhtar',
  'el meniaa': 'el menia',
}

function normalize(name) {
  const n = (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/['’\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return NAME_ALIASES[n] || n
}

const PATHS_BY_NORMALIZED_NAME = ALGERIA_WILAYA_PATHS.reduce((acc, p) => {
  acc[normalize(p.name)] = p
  return acc
}, {})

/**
 * Carte choroplèthe de l'Algérie (58 wilayas) — colore chaque wilaya selon
 * `data` ([{wilaya, orders_count, ...}]) et affiche une infobulle au survol.
 * Tracés SVG : simplemaps.com (Free for Commercial Use).
 */
export default function AlgeriaMap({ data = [] }) {
  const [hovered, setHovered] = useState(null)

  const { valueByPathId, maxValue } = useMemo(() => {
    const map = {}
    let max = 0
    for (const row of data) {
      const path = PATHS_BY_NORMALIZED_NAME[normalize(row.wilaya)]
      if (!path) continue
      map[path.id] = row
      if (row.orders_count > max) max = row.orders_count
    }
    return { valueByPathId: map, maxValue: max || 1 }
  }, [data])

  const colorFor = (pathId) => {
    const row = valueByPathId[pathId]
    if (!row || !row.orders_count) return 'rgba(255,255,255,0.05)'
    const intensity = Math.min(1, row.orders_count / maxValue)
    // Dégradé violet cohérent avec la charte (theme.stat.violet.hex = #8b5cf6)
    const alpha = 0.15 + intensity * 0.75
    return `rgba(139, 92, 246, ${alpha.toFixed(2)})`
  }

  return (
    <div className="relative">
      <svg viewBox={ALGERIA_MAP_VIEWBOX} className="w-full h-auto" role="img" aria-label="Carte des commandes par wilaya">
        {ALGERIA_WILAYA_PATHS.map(p => (
          <path
            key={p.id}
            d={p.d}
            fill={colorFor(p.id)}
            stroke={theme.dark.border}
            strokeWidth={1}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(h => (h === p.id ? null : h))}
            style={{ transition: 'fill 0.3s ease', cursor: valueByPathId[p.id] ? 'pointer' : 'default' }}
          />
        ))}
      </svg>
      {hovered && (() => {
        const row = valueByPathId[hovered]
        const path = ALGERIA_WILAYA_PATHS.find(p => p.id === hovered)
        return (
          <div className="absolute top-2 left-2 rounded-lg border px-3 py-2 text-xs pointer-events-none"
            style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
            <p className="font-semibold text-gray-200">{path?.name}</p>
            {row ? (
              <>
                <p style={{ color: theme.dark.muted }}>{row.orders_count} commande{row.orders_count !== 1 ? 's' : ''}</p>
                {row.revenue != null && (
                  <p style={{ color: theme.dark.muted }}>{Number(row.revenue).toLocaleString('fr-DZ')} DA</p>
                )}
              </>
            ) : (
              <p style={{ color: theme.dark.muted }}>Aucune commande</p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
