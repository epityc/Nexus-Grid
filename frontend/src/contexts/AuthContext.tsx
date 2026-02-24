import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import api from '../api/client'

interface User {
  id: string
  email: string
  username: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  error: string | null
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'nexus_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.post('/auth/login', { email, password })
      const { access_token } = res.data
      localStorage.setItem(TOKEN_KEY, access_token)
      setToken(access_token)
      // Decode user info from token payload (base64)
      const payload = JSON.parse(atob(access_token.split('.')[1]))
      setUser({ id: payload.sub, email, username: email.split('@')[0] })
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Identifiants incorrects')
      throw e
    } finally {
      setIsLoading(false)
    }
  }, [])

  const register = useCallback(async (email: string, username: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      await api.post('/auth/register', { email, username, password })
      await login(email, password)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Erreur lors de l\'inscription')
      throw e
    } finally {
      setIsLoading(false)
    }
  }, [login])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
