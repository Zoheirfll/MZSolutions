// Applique le thème sur <html> avant le premier rendu : choix mémorisé, sinon
// préférence du système. Sans ça, une page publique ouverte directement
// (ex. /auth) resterait sombre jusqu'à ce qu'un composant monte.
// Le dashboard garde son défaut sombre (useTheme) tant qu'aucun choix n'existe.
export function initTheme() {
  let stored = null
  try { stored = localStorage.getItem('mz-theme') } catch { /* stockage indisponible */ }
  const system = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  document.documentElement.dataset.theme = stored === 'light' || stored === 'dark' ? stored : system
}
