import axios from 'axios'

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL manquant en production — les appels API pointeront vers localhost.')
}

const publicApi = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/public`,
})

export default publicApi
