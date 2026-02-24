import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  onClose: () => void
}

export default function AuthModal({ onClose }: Props) {
  const { login, register, isLoading, error } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, username, password)
      }
      onClose()
    } catch {
      // error is already set in context
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-6 pt-6 pb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="text-white font-bold text-sm">Nexus Grid</span>
          </div>
          <p className="text-white font-semibold text-lg">
            {mode === 'login' ? 'Bienvenue' : 'Créer un compte'}
          </p>
          <p className="text-indigo-200 text-xs mt-0.5">
            {mode === 'login'
              ? 'Connectez-vous pour accéder aux fonctionnalités IA'
              : 'Rejoignez Nexus Grid gratuitement'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 -mt-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="vous@exemple.com"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nom d'utilisateur</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="monpseudo"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 font-medium">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {isLoading
              ? 'Chargement...'
              : mode === 'login' ? 'Se connecter' : 'S\'inscrire'}
          </button>

          <p className="text-center text-xs text-gray-500 mt-3">
            {mode === 'login' ? 'Pas encore de compte ?' : 'Déjà inscrit ?'}{' '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-indigo-600 font-semibold hover:underline"
            >
              {mode === 'login' ? 'S\'inscrire' : 'Se connecter'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
