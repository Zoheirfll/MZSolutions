import axios from 'axios'

// Epic 8.6 — en build de production, un VITE_API_URL absent ne doit jamais
// retomber silencieusement sur localhost (échec confus en prod plutôt qu'une
// erreur explicite au build).
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL manquant en production — les appels API pointeront vers localhost.')
}

// En dev, sans VITE_API_URL explicite, on utilise une base RELATIVE ('') plutôt
// que 'http://localhost:8000' en dur — le proxy Vite (vite.config.js, /api et
// /media → localhost:8000) route alors correctement quel que soit l'hôte qui a
// chargé la page. Piège réel rencontré : avec une base absolue localhost:8000,
// un visiteur accédant au site via le tunnel ngrok (qui pointe vers le port
// 5173) recevait un JS qui tentait d'appeler localhost:8000 sur SA PROPRE
// machine — connexion impossible, aucune requête n'atteignait jamais le tunnel.
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'http://localhost:8000')
// Détecté depuis l'URL réellement chargée par le navigateur (pas API_BASE) —
// nécessaire même avec une base relative, car ngrok intercepte toutes les
// requêtes du tunnel, y compris les appels API same-origin.
const IS_NGROK = typeof window !== 'undefined' && /ngrok/.test(window.location.hostname)

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  // Cookies httpOnly (mz_access/mz_refresh, voir accounts/cookie_auth.py) —
  // remplace le Bearer token lu depuis localStorage (Epic 8.6 TBD : un script
  // XSS ne peut plus voler le token, seul le navigateur peut l'envoyer).
  // Nécessaire même en same-origin pour que le navigateur attache les cookies.
  withCredentials: true,
  // Contourne la page d'avertissement ngrok (sinon ngrok intercepte la
  // requête AVANT le serveur et renvoie une page HTML sans en-têtes CORS —
  // ce qui ressemble à tort à une erreur CORS classique). Envoyé uniquement
  // quand VITE_API_URL pointe vers un tunnel ngrok : sur localhost/prod, cet
  // en-tête personnalisé n'est pas dans CORS_ALLOW_HEADERS et fait échouer
  // le préflight CORS pour rien.
  headers: IS_NGROK ? { 'ngrok-skip-browser-warning': 'true' } : {},
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/token/refresh/')) {
      original._retry = true
      try {
        // Le refresh token voyage lui aussi dans son propre cookie httpOnly —
        // rien à lire/écrire côté JS, le navigateur l'envoie automatiquement.
        await axios.post(`${API_BASE}/api/token/refresh/`, {}, {
          withCredentials: true,
          headers: IS_NGROK ? { 'ngrok-skip-browser-warning': 'true' } : {},
        })
        return api(original)
      } catch {
        window.location.href = '/auth'
      }
    }
    return Promise.reject(error)
  }
)

export default api
