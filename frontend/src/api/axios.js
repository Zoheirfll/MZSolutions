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
  // Contourne la page d'avertissement ngrok (sinon ngrok intercepte la
  // requête AVANT le serveur et renvoie une page HTML sans en-têtes CORS —
  // ce qui ressemble à tort à une erreur CORS classique). Envoyé uniquement
  // quand VITE_API_URL pointe vers un tunnel ngrok : sur localhost/prod, cet
  // en-tête personnalisé n'est pas dans CORS_ALLOW_HEADERS et fait échouer
  // le préflight CORS pour rien.
  headers: IS_NGROK ? { 'ngrok-skip-browser-warning': 'true' } : {},
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh')
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE}/api/token/refresh/`, { refresh }, {
            headers: IS_NGROK ? { 'ngrok-skip-browser-warning': 'true' } : {},
          })
          localStorage.setItem('access', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          localStorage.removeItem('access')
          localStorage.removeItem('refresh')
          window.location.href = '/auth'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
