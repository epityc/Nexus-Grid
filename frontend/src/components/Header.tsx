import { Monitor, RefreshCw, Maximize2 } from './icons'

export default function Header() {
  return (
    <header className="h-11 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
      {/* Left spacer */}
      <div className="w-64 shrink-0" />

      {/* Centered title */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm font-semibold text-gray-800 tracking-tight">
          Nexus Grid —{' '}
          <span className="font-normal text-gray-500">The AI-First Spreadsheet</span>
        </span>
      </div>

      {/* Right icons */}
      <div className="flex items-center gap-3 text-gray-400">
        <button className="hover:text-gray-600 transition-colors" title="Appareils connectés">
          <Monitor />
        </button>
        <button className="hover:text-gray-600 transition-colors" title="Synchroniser">
          <RefreshCw />
        </button>
        <button className="hover:text-gray-600 transition-colors" title="Plein écran">
          <Maximize2 />
        </button>
      </div>
    </header>
  )
}
