import axios from 'axios'

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL manquant en production — les appels API pointeront vers localhost.')
}

// Voir api/axios.js pour le détail — base relative en dev (proxy Vite) pour
// que le tunnel ngrok (qui pointe vers le port frontend) fonctionne sans
// resynchroniser VITE_API_URL à chaque redémarrage d'ngrok.
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'http://localhost:8000')
const IS_NGROK = typeof window !== 'undefined' && /ngrok/.test(window.location.hostname)

const publicApi = axios.create({
  baseURL: `${API_BASE}/api/public`,
  // Voir api/axios.js — en-tête ngrok uniquement utile (et sans danger côté
  // CORS) quand la base pointe réellement vers un tunnel ngrok.
  headers: IS_NGROK ? { 'ngrok-skip-browser-warning': 'true' } : {},
})

export default publicApi
