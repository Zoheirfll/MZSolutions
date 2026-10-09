import { useEffect, useState } from 'react'

const STORAGE_KEY = 'mz-theme'

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

// `fallback` : thème utilisé tant que l'utilisateur n'a rien choisi. Le choix
// n'est mémorisé qu'à un vrai basculement, pour qu'un défaut (ex. préférence
// système sur la landing) ne devienne jamais un choix permanent à son insu.
export function useTheme(fallback = 'dark') {
  const [theme, setTheme] = useState(() => readStoredTheme() || fallback)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* stockage indisponible */ }
    setTheme(next)
  }

  return { theme, toggleTheme }
}
