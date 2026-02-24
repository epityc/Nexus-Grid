import { Sparkle } from './icons'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  engineStatus: 'online' | 'offline'
  onOpenAuth: () => void
}

export default function Toolbar({ engineStatus, onOpenAuth }: Props) {
  const { user } = useAuth()
  const initials = user ? user.username.slice(0, 2).toUpperCase() : 'JD'

  return (
    <div className="h-11 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0">

      {/* Workspace label */}
      <span className="text-sm font-semibold text-gray-700 shrink-0">Espace de Travail</span>

      {/* Engine status badge */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${
        engineStatus === 'online'
          ? 'bg-green-50 border-green-200 text-green-600'
          : 'bg-gray-100 border-gray-200 text-gray-500'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${
          engineStatus === 'online' ? 'bg-green-500' : 'bg-gray-400'
        }`} />
        Logic Engine: {engineStatus === 'online' ? 'Online' : 'Offline'}
      </div>

      <div className="flex-1" />

      {/* User avatar */}
      <button
        onClick={onOpenAuth}
        className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold hover:bg-indigo-700 transition-colors"
        title={user ? user.email : 'Se connecter'}
      >
        {initials}
      </button>

      {/* Console Active button */}
      <button
        onClick={onOpenAuth}
        className="flex items-center gap-1.5 bg-indigo-900 hover:bg-indigo-800 transition-colors text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
      >
        <Sparkle size={11} />
        <span>Console Active</span>
      </button>
    </div>
  )
}
