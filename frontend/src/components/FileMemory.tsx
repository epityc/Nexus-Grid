import { useEffect, useRef, useState } from 'react'
import { Database, FileText, Upload, X } from './icons'
import { type UploadedFile, deleteFile, listFiles, uploadFile } from '../api/client'

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: 'bg-red-100 text-red-700',
  csv: 'bg-green-100 text-green-700',
  xlsx: 'bg-emerald-100 text-emerald-700',
  xls: 'bg-emerald-100 text-emerald-700',
  txt: 'bg-gray-100 text-gray-600',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

interface Props {
  selectedIds: string[]
  onToggle: (id: string) => void
  token: string | null
  onOpenAuth: () => void
}

export default function FileMemory({ selectedIds, onToggle, token, onOpenAuth }: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (token) {
      listFiles().then(setFiles).catch(() => setFiles([]))
    }
  }, [token])

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    if (!token) {
      onOpenAuth()
      return
    }
    setError(null)
    setUploading(true)
    try {
      const uploaded = await uploadFile(fileList[0])
      setFiles(prev => [uploaded, ...prev])
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Erreur lors de l\'envoi du fichier'
      setError(msg)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    await deleteFile(id)
    setFiles(prev => prev.filter(f => f.id !== id))
    if (selectedIds.includes(id)) onToggle(id)
  }

  return (
    <div className="border-t border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500">
          <Database size={11} />
          Mémoire
          {files.length > 0 && (
            <span className="ml-1 bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0 text-[10px] font-semibold">
              {files.length}
            </span>
          )}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:text-gray-400 transition-colors"
        >
          <Upload size={11} />
          {uploading ? 'Envoi…' : 'Importer'}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.csv,.xlsx,.xls,.txt"
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {/* Drop zone (shown when no files) */}
      {files.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={`mx-3 my-2 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 py-4 cursor-pointer transition-colors ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
          }`}
        >
          <FileText size={20} />
          <p className="text-[11px] text-gray-500 text-center px-2">
            PDF, CSV, XLSX, XLS, TXT<br />
            <span className="text-gray-400">Glissez ou cliquez</span>
          </p>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <ul
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          className={`max-h-36 overflow-y-auto px-2 py-1.5 transition-colors ${dragOver ? 'bg-indigo-50' : ''}`}
        >
          {files.map(f => {
            const selected = selectedIds.includes(f.id)
            return (
              <li
                key={f.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors mb-0.5 ${
                  selected ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-gray-50'
                }`}
                onClick={() => onToggle(f.id)}
              >
                {/* Checkbox */}
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                }`}>
                  {selected && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Badge type */}
                <span className={`text-[9px] font-bold uppercase rounded px-1 py-0.5 shrink-0 ${FILE_TYPE_COLORS[f.file_type] ?? 'bg-gray-100 text-gray-500'}`}>
                  {f.file_type}
                </span>

                {/* Name + size */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-700 truncate leading-tight">{f.original_name}</p>
                  <p className="text-[10px] text-gray-400">{formatBytes(f.file_size)}</p>
                </div>

                {/* Delete */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(f.id) }}
                  className="shrink-0 text-gray-300 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Error */}
      {error && (
        <p className="text-[10px] text-red-500 px-3 pb-2">{error}</p>
      )}

      {/* Hint when files selected */}
      {selectedIds.length > 0 && (
        <p className="text-[10px] text-indigo-500 px-3 pb-2">
          {selectedIds.length} fichier{selectedIds.length > 1 ? 's' : ''} inclus dans le contexte IA
        </p>
      )}
    </div>
  )
}
