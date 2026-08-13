import { useEffect, useState } from 'react'
import api from '../api/axios'

// Aperçu carte du bureau/point relais sélectionné — pur affichage (pas de
// pin manuel). Géocode l'adresse via `/stores/me/geocode/` (Nominatim/
// OpenStreetMap côté serveur, gratuit, aucune clé API ni carte bancaire —
// contrairement à Google Maps) puis affiche une carte OpenStreetMap
// embarquée centrée sur le point trouvé.
//
// Les adresses des transporteurs sont souvent des descriptions ("en face
// fulla moda, à côté de supérette El kandi") que Nominatim ne sait pas
// géocoder — on retente donc avec des requêtes de plus en plus larges
// (adresse complète → quartier extrait du nom du bureau → wilaya seule)
// jusqu'à obtenir un résultat, en prévenant si la position n'est
// qu'approximative (échelle wilaya).
function buildCandidates(name, address, wilaya) {
  const candidates = []
  if (address && wilaya) candidates.push({ q: `${address}, ${wilaya}, Algérie`, approx: false })
  const quartier = (name || '').match(/«\s*([^»]+)\s*»/)?.[1]?.trim()
  if (quartier && wilaya) candidates.push({ q: `${quartier}, ${wilaya}, Algérie`, approx: false })
  if (address && wilaya) candidates.push({ q: `${address}`, approx: false })
  if (wilaya) candidates.push({ q: `${wilaya}, Algérie`, approx: true })
  return candidates
}

export default function DeskMapPreview({ name, address, wilaya }) {
  const [coords, setCoords]     = useState(null)
  const [approx, setApprox]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!address) { setCoords(null); return }
    let cancelled = false
    const candidates = buildCandidates(name, address, wilaya)

    async function run() {
      setLoading(true)
      setNotFound(false)
      for (const candidate of candidates) {
        try {
          const { data } = await api.get(`/stores/me/geocode/?q=${encodeURIComponent(candidate.q)}`)
          if (!cancelled) {
            setCoords(data)
            setApprox(candidate.approx)
          }
          return
        } catch {
          // essaie la requête suivante, plus large
        }
      }
      if (!cancelled) { setCoords(null); setNotFound(true) }
    }

    run().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, address, wilaya])

  if (!address) return null

  if (loading) {
    return <p className="text-xs mt-2" style={{ color: 'var(--text-muted, #8a8f98)' }}>Localisation du bureau…</p>
  }
  if (notFound || !coords) {
    return <p className="text-xs mt-2" style={{ color: 'var(--text-muted, #8a8f98)' }}>Position introuvable pour cette adresse.</p>
  }

  const delta = approx ? 0.08 : 0.01
  const bbox = [coords.lon - delta, coords.lat - delta, coords.lon + delta, coords.lat + delta].join(',')

  return (
    <div className="mt-2">
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-color, #23252a)' }}>
        <iframe
          title={`Position — ${name || address}`}
          width="100%"
          height="220"
          style={{ border: 0, display: 'block' }}
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat},${coords.lon}`}
        />
      </div>
      {approx && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted, #8a8f98)' }}>
          Position approximative (adresse précise non localisable — échelle de la wilaya).
        </p>
      )}
    </div>
  )
}
