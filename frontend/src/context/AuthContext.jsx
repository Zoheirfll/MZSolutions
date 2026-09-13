import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    // Recharge /auth/me/ sans re-basculer `loading` — utilisé après un
    // changement de contexte serveur qui ne passe PAS par login/logout
    // (ex: entrer/quitter le mode "Gérer cette boutique", platform_admin),
    // où l'utilisateur reste le même mais store/team_role/permissions
    // changent côté serveur.
    try {
      const { data } = await api.get('/auth/me/')
      setUser(data)
      return data
    } catch {
      return null
    }
  }

  useEffect(() => {
    // Le token JWT vit dans un cookie httpOnly (migration sécurité — plus de
    // localStorage, illisible par du JS) : impossible de savoir côté client
    // s'il existe sans interroger le serveur. `/auth/me/` sert cette double
    // fonction (session active ? + données utilisateur), le cookie est
    // automatiquement envoyé par le navigateur (même origine, voir axios.js).
    api.get('/auth/me/')
      .then(({ data }) => setUser(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login/', { email, password })
    setUser(data.user)
    return data
  }

  const register = async (payload) => {
    const { data } = await api.post('/auth/register/', payload)
    return data
  }

  const logout = () => {
    // Blackliste le refresh token côté serveur (Epic 8.6) et efface les
    // cookies — best-effort, ne doit jamais empêcher la déconnexion locale
    // même si l'appel échoue.
    api.post('/auth/logout/').catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
