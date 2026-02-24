import { useState, useEffect } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { SpreadsheetProvider } from './contexts/SpreadsheetContext'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import FormulaBar from './components/FormulaBar'
import Spreadsheet from './components/Spreadsheet'
import AIPanel from './components/AIPanel'
import AuthModal from './components/AuthModal'

type EngineStatus = 'online' | 'offline'

function AppShell() {
  const [showAuth, setShowAuth] = useState(false)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('offline')

  // Try to connect to the backend WebSocket for Logic Engine status
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      try {
        ws = new WebSocket(`ws://${window.location.host}/ws/logic-engine`)
        ws.onopen = () => setEngineStatus('online')
        ws.onclose = () => {
          setEngineStatus('offline')
          reconnectTimer = setTimeout(connect, 5000)
        }
        ws.onerror = () => {
          ws?.close()
        }
      } catch {
        setEngineStatus('offline')
      }
    }

    connect()
    return () => {
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onOpenAuth={() => setShowAuth(true)} />
        <main className="flex flex-col flex-1 overflow-hidden border-r border-gray-200">
          <Toolbar
            engineStatus={engineStatus}
            onOpenAuth={() => setShowAuth(true)}
          />
          <FormulaBar />
          <Spreadsheet />
        </main>
        <AIPanel onOpenAuth={() => setShowAuth(true)} />
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SpreadsheetProvider>
        <AppShell />
      </SpreadsheetProvider>
    </AuthProvider>
  )
}
