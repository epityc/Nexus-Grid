import { useState, useRef, useEffect } from 'react'
import { Send, Activity, Zap } from './icons'
import { useAuth } from '../contexts/AuthContext'
import { chatWithFiles, computeWithSpreadsheet, ComputeResult } from '../api/client'
import FileMemory from './FileMemory'
import { useSpreadsheet } from '../contexts/SpreadsheetContext'

type Tab = 'nexus-ai' | 'logic-engine'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  compute?: ComputeResult // structured formula/value response
}

const EXAMPLES = [
  'Calcule la somme de A1 à A10',
  'Génère une formule de pourcentage',
  'Analyse les données de ce tableau',
]

interface Props {
  onOpenAuth: () => void
}

export default function AIPanel({ onOpenAuth }: Props) {
  const { token } = useAuth()
  const { selectedCell, setCell, cellRef, getCellsAsCsv } = useSpreadsheet()
  const [tab, setTab] = useState<Tab>('nexus-ai')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const toggleFile = (id: string) => {
    setSelectedFileIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const insertIntoCell = (content: string) => {
    if (!selectedCell) return
    setCell(selectedCell.row, selectedCell.col, content)
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    if (!token) {
      onOpenAuth()
      return
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      let assistantMsg: Message

      if (selectedFileIds.length > 0) {
        // Chat with file context
        const answer = await chatWithFiles(text.trim(), selectedFileIds)
        assistantMsg = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: answer,
        }
      } else {
        // AI compute with spreadsheet context
        const csv = getCellsAsCsv()
        const cellName = selectedCell ? cellRef(selectedCell.row, selectedCell.col) : ''
        const result = await computeWithSpreadsheet(text.trim(), csv, cellName)

        if (result.type === 'explanation') {
          assistantMsg = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.content,
          }
        } else {
          assistantMsg = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.explanation || result.content,
            compute: result,
          }
        }
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Impossible de contacter le moteur IA. Vérifiez votre connexion.',
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <aside className="w-80 shrink-0 flex flex-col bg-white border-l border-gray-200 h-full">

      {/* Tabs */}
      <div className="flex border-b border-gray-200 shrink-0">
        {(['nexus-ai', 'logic-engine'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
              tab === t
                ? 'text-gray-900 border-b-2 border-indigo-500'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t === 'nexus-ai' ? 'Nexus AI' : 'Logic Engine'}
          </button>
        ))}
      </div>

      {tab === 'nexus-ai' ? (
        <>
          {/* Chat area */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {/* Welcome bubble */}
            {messages.length === 0 && (
              <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 p-4 text-white shadow-sm">
                <p className="font-semibold text-sm mb-3">Comment puis-je vous aider ?</p>
                <div className="space-y-2">
                  {EXAMPLES.map(ex => (
                    <button
                      key={ex}
                      onClick={() => sendMessage(ex)}
                      className="block w-full text-left text-xs bg-white/15 hover:bg-white/25 transition-colors rounded-lg px-3 py-2 text-white/90"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[90%] flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Formula / value insert card */}
                  {msg.compute && (msg.compute.type === 'formula' || msg.compute.type === 'value') && (
                    <div className="w-full bg-indigo-50 border border-indigo-100 rounded-xl p-2.5">
                      <code className="block text-xs font-mono text-indigo-700 mb-2 break-all">
                        {msg.compute.content}
                      </code>
                      <button
                        onClick={() => insertIntoCell(msg.compute!.content)}
                        disabled={!selectedCell}
                        className="w-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg py-1.5 transition-colors"
                      >
                        {selectedCell
                          ? `Insérer dans ${cellRef(selectedCell.row, selectedCell.col)}`
                          : 'Sélectionnez une cellule'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">
                  Historique
                </p>
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-gray-300">
                  <Activity size={30} />
                  <p className="text-xs text-gray-400">Aucune activité</p>
                </div>
              </div>
            )}
          </div>

          {/* File memory */}
          <FileMemory
            selectedIds={selectedFileIds}
            onToggle={toggleFile}
            token={token}
            onOpenAuth={onOpenAuth}
          />

          {/* Chat input */}
          <div className="p-3 border-t border-gray-100 shrink-0">
            <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={
                  selectedFileIds.length > 0
                    ? `Interroger ${selectedFileIds.length} fichier${selectedFileIds.length > 1 ? 's' : ''}…`
                    : selectedCell
                      ? `Demander pour ${cellRef(selectedCell.row, selectedCell.col)}…`
                      : "Instruire l'IA…"
                }
                className="flex-1 bg-transparent text-[13px] text-gray-700 placeholder:text-gray-400 outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors shrink-0"
              >
                <Send size={13} />
              </button>
            </form>
            <p className="text-[10px] text-gray-400 text-center mt-2 leading-relaxed">
              L'IA voit votre feuille de calcul en temps réel.
            </p>
          </div>
        </>
      ) : (
        /* Logic Engine tab */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
            <Zap size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Logic Engine</p>
            <p className="text-xs text-gray-400 mt-1">
              Le moteur d'analyse propriétaire Nexus n'est pas encore connecté.
            </p>
          </div>
          <button
            onClick={onOpenAuth}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline"
          >
            Configurer la connexion
          </button>
        </div>
      )}
    </aside>
  )
}
