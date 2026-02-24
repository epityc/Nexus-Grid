import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

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
  cellRef: (row: number, col: number) => string
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

  const cellRefFn = useCallback((row: number, col: number) => {
    return `${colLetter(col)}${row + 1}`
  }, [])

  return (
    <SpreadsheetContext.Provider value={{
      cells, selectedCell, editingCell,
      setCell, selectCell, startEditing, stopEditing, getCellValue,
      cellRef: cellRefFn,
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
