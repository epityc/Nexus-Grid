import { useSpreadsheet } from '../contexts/SpreadsheetContext'
import { generateFormula } from '../api/client'
import { useState } from 'react'

export default function FormulaBar() {
  const { selectedCell, getCellValue, setCell, cellRef } = useSpreadsheet()
  const [isGenerating, setIsGenerating] = useState(false)

  const value = selectedCell
    ? getCellValue(selectedCell.row, selectedCell.col)
    : ''

  const ref = selectedCell
    ? cellRef(selectedCell.row, selectedCell.col)
    : '—'

  const handleFormulaBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCell) return
    setCell(selectedCell.row, selectedCell.col, e.target.value)
  }

  const handleAIFormula = async () => {
    if (!selectedCell || !value || isGenerating) return
    if (!value.startsWith('/')) return
    const description = value.slice(1).trim()
    if (!description) return
    setIsGenerating(true)
    try {
      const formula = await generateFormula(description)
      setCell(selectedCell.row, selectedCell.col, formula)
    } catch {
      // silently fail — keep original value
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="h-9 bg-white border-b border-gray-200 flex items-center px-2 gap-2 shrink-0">
      {/* Cell reference display */}
      <div className="w-14 shrink-0 flex items-center justify-center border border-gray-200 rounded h-6 bg-gray-50">
        <span className="text-xs font-mono font-medium text-gray-500">{ref}</span>
      </div>

      <div className="w-px h-5 bg-gray-200 shrink-0" />

      {/* fx label */}
      <span className="text-xs font-semibold text-gray-400 italic shrink-0">fx</span>

      {/* Formula input */}
      <input
        type="text"
        value={value}
        onChange={handleFormulaBarChange}
        onKeyDown={e => { if (e.key === 'Enter') handleAIFormula() }}
        placeholder={
          isGenerating
            ? 'Génération de la formule...'
            : 'Saisissez une valeur ou laissez l\'IA opérer... (préfixe / pour IA)'
        }
        disabled={!selectedCell || isGenerating}
        className="flex-1 text-xs text-gray-700 bg-transparent outline-none placeholder:text-gray-400 disabled:placeholder:text-gray-300"
      />

      {isGenerating && (
        <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
      )}
    </div>
  )
}
