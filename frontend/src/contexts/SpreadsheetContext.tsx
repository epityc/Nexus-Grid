import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { evaluateCell } from '../utils/formulaEngine'

export interface CellCoord { row: number; col: number }
export type CellData = Record<string, string> // key = "r,c"

interface SpreadsheetContextType {
  cells: CellData
  selectedCell: CellCoord | null
  editingCell: CellCoord | null
  setCell: (row: number, col: number, value: string) => void
  selectCell: (coord: CellCoord | null) => void
  startEditing: (coord: CellCoord) => void
  stopEditing: () => void
  getCellValue: (row: number, col: number) => string
  getComputedValue: (row: number, col: number) => string
  cellRef: (row: number, col: number) => string
  importGrid: (data: string[][], rowOffset?: number, colOffset?: number) => void
  getCellsAsCsv: () => string
}

const SpreadsheetContext = createContext<SpreadsheetContextType | null>(null)

function cellKey(row: number, col: number) { return `${row},${col}` }
function colLetter(col: number) { return String.fromCharCode(65 + col) }

export function SpreadsheetProvider({ children }: { children: ReactNode }) {
  const [cells, setCells] = useState<CellData>({})
  const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null)
  const [editingCell, setEditingCell] = useState<CellCoord | null>(null)

  const setCell = useCallback((row: number, col: number, value: string) => {
    setCells(prev => {
      const key = cellKey(row, col)
      if (value === '' && prev[key] === undefined) return prev
      if (value === '') {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }, [])

  const selectCell = useCallback((coord: CellCoord | null) => {
    setSelectedCell(coord)
    setEditingCell(null)
  }, [])

  const startEditing = useCallback((coord: CellCoord) => {
    setSelectedCell(coord)
    setEditingCell(coord)
  }, [])

  const stopEditing = useCallback(() => {
    setEditingCell(null)
  }, [])

  const getCellValue = useCallback((row: number, col: number) => {
    return cells[cellKey(row, col)] ?? ''
  }, [cells])

  // Returns the evaluated/computed value of a cell (resolves formulas)
  const getComputedValue = useCallback((row: number, col: number) => {
    const raw = cells[cellKey(row, col)] ?? ''
    if (!raw.startsWith('=')) return raw
    return evaluateCell(raw, (r, c) => cells[cellKey(r, c)] ?? '')
  }, [cells])

  const cellRefFn = useCallback((row: number, col: number) => {
    return `${colLetter(col)}${row + 1}`
  }, [])

  const importGrid = useCallback((data: string[][], rowOffset = 0, colOffset = 0) => {
    setCells(prev => {
      const next = { ...prev }
      data.forEach((row, r) => {
        row.forEach((val, c) => {
          const key = cellKey(r + rowOffset, c + colOffset)
          if (val !== '') {
            next[key] = val
          }
        })
      })
      return next
    })
  }, [])

  // Serialize spreadsheet as tab-separated values for AI context
  const getCellsAsCsv = useCallback(() => {
    const entries = Object.entries(cells)
    if (entries.length === 0) return ''
    let maxRow = 0, maxCol = 0
    entries.forEach(([key]) => {
      const [r, c] = key.split(',').map(Number)
      maxRow = Math.max(maxRow, r)
      maxCol = Math.max(maxCol, c)
    })
    const getter = (r: number, c: number) => cells[cellKey(r, c)] ?? ''
    const lines: string[] = []
    for (let r = 0; r <= maxRow; r++) {
      const row: string[] = []
      for (let c = 0; c <= maxCol; c++) {
        const raw = cells[cellKey(r, c)] ?? ''
        const display = raw.startsWith('=') ? evaluateCell(raw, getter) : raw
        row.push(display)
      }
      lines.push(row.join('\t'))
    }
    return lines.join('\n')
  }, [cells])

  return (
    <SpreadsheetContext.Provider value={{
      cells, selectedCell, editingCell,
      setCell, selectCell, startEditing, stopEditing,
      getCellValue, getComputedValue,
      cellRef: cellRefFn, importGrid, getCellsAsCsv,
    }}>
      {children}
    </SpreadsheetContext.Provider>
  )
}

export function useSpreadsheet() {
  const ctx = useContext(SpreadsheetContext)
  if (!ctx) throw new Error('useSpreadsheet must be inside SpreadsheetProvider')
  return ctx
}
