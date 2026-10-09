import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
    port: 3002,
    strictPort: true,
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io'],
    proxy: {
      '/api': 'http://localhost:8003',
      '/media': 'http://localhost:8003',
      // Pages légales HTML servies par Django (sinon Vite renvoie l'app React → 404).
      '/legal': 'http://localhost:8003',
      '/admin': 'http://localhost:8003',
    },
  },
})
