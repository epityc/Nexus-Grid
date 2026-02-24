import { Lock, Key, AlertTriangle } from './icons'
import { useAuth } from '../contexts/AuthContext'

const plans = [
  { id: 'free',  label: 'Free',  price: '0€' },
  { id: 'plus',  label: 'Plus',  price: '19€' },
  { id: 'pro',   label: 'Pro',   price: '49€' },
]

interface Props {
  onOpenAuth: () => void
}

export default function Sidebar({ onOpenAuth }: Props) {
  const { user } = useAuth()
  const initials = user
    ? user.username.slice(0, 2).toUpperCase()
    : 'JD'

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-white border-r border-gray-200 h-full select-none">

      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-base leading-none">N</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">Nexus Grid</p>
            <p className="text-[10px] font-semibold tracking-widest text-indigo-500 uppercase">Logic & AI</p>
          </div>
        </div>
      </div>

      {/* MOTEUR LEXEE */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={onOpenAuth}
          className="w-full flex items-center gap-2 bg-gray-900 hover:bg-gray-800 transition-colors text-white text-xs font-semibold px-3 py-2.5 rounded-lg"
        >
          <span className="text-yellow-400">
            <Lock size={13} />
          </span>
          <span className="tracking-wide uppercase">Moteur Lexee</span>
        </button>
      </div>

      {/* PLAN ACTUEL */}
      <div className="px-4 pt-3">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Plan actuel</p>
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-800">Free</span>
            <span className="text-[10px] font-bold bg-gray-800 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
              Actif
            </span>
          </div>
          <div className="mb-1">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Requêtes IA Nexus</span>
              <span className="font-medium text-gray-700">0 / 10</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full w-0 bg-indigo-500 rounded-full" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 italic mt-2 leading-relaxed">
            Datasets illimités, pas de limite de lignes.
          </p>
        </div>
      </div>

      {/* METTRE À NIVEAU */}
      <div className="px-4 pt-4">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Mettre à niveau</p>
        <div className="space-y-1.5">
          {plans.map(plan => (
            <button
              key={plan.id}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                plan.id === 'free'
                  ? 'border-2 border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 bg-white'
              }`}
            >
              <span>{plan.label}</span>
              <span className={plan.id === 'free' ? 'text-indigo-500' : 'text-gray-400'}>
                {plan.price}
              </span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 italic mt-3 leading-relaxed">
          Enterprises Sales:{' '}
          <a
            href="mailto:kaweldigital@gmail.com"
            className="text-indigo-500 hover:underline not-italic"
          >
            kaweldigital@gmail.com
          </a>
        </p>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* CLÉ GEMINI REQUISE */}
      <div className="px-4 pb-4 pt-2">
        <button
          onClick={onOpenAuth}
          className="w-full flex items-center gap-2 border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors text-amber-700 text-xs font-semibold px-3 py-2.5 rounded-lg"
        >
          <AlertTriangle size={13} />
          <span className="tracking-wide uppercase">Clé Gemini requise</span>
        </button>
      </div>
    </aside>
  )
}
