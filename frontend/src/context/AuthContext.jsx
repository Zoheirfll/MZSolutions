import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

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
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
