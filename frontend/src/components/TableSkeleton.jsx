import { useTranslation } from 'react-i18next'

// Lignes « squelette » d'un tableau en cours de chargement : la structure
// reste visible (pas de saut de mise en page à l'arrivée des données) et
// l'état est annoncé aux lecteurs d'écran. Animation désactivée si l'utilisateur
// demande moins de mouvement (motion-safe).
export default function TableSkeleton({ rows = 6, cols = 6 }) {
  const { t } = useTranslation('dashboard')
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden={r > 0 ? 'true' : undefined}>
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className="px-4 py-3.5">
          {r === 0 && c === 0 && <span role="status" className="sr-only">{t('Chargement…')}</span>}
          <div className={`h-3.5 rounded bg-app-card-alt motion-safe:animate-pulse ${c === 0 ? 'w-8' : c % 3 === 0 ? 'w-24' : 'w-16'}`} />
        </td>
      ))}
    </tr>
  ))
}
