import { useRef, useEffect, useCallback, KeyboardEvent, memo } from 'react'
import { useSpreadsheet, CellCoord } from '../contexts/SpreadsheetContext'

const ROWS = 50
const COLS = 26

function colLetter(col: number) {
  return String.fromCharCode(65 + col)
}

// ── Single Cell ──────────────────────────────────────────────────────────────
interface CellProps {
  row: number
  col: number
  rawValue: string      // raw formula/text (shown when editing)
  displayValue: string  // computed result (shown when not editing)
  isSelected: boolean
  isEditing: boolean
  onSelect: (coord: CellCoord) => void
  onStartEdit: (coord: CellCoord) => void
  onChange: (row: number, col: number, value: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => void
}

const Cell = memo(function Cell({
  row, col, rawValue, displayValue, isSelected, isEditing,
  onSelect, onStartEdit, onChange, onKeyDown,
}: CellProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Detect if display value looks numeric (right-align numbers like Excel)
  const isNumeric = !isEditing && displayValue !== '' && !isNaN(Number(displayValue))

  return (
    <td
      className={`relative border-r border-b border-gray-200 p-0 h-7 min-w-[100px] max-w-[200px] ${
        isSelected ? 'cell-selected bg-indigo-50/40' : 'bg-white hover:bg-gray-50/70'
      }`}
      onClick={() => onSelect({ row, col })}
      onDoubleClick={() => onStartEdit({ row, col })}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          className="cell-input"
          value={rawValue}
          onChange={e => onChange(row, col, e.target.value)}
          onKeyDown={e => onKeyDown(e, row, col)}
          onBlur={() => { /* commit on blur handled by context */ }}
        />
      ) : (
        <span className={`block px-1.5 text-[13px] truncate leading-7 h-7 ${
          displayValue.startsWith('#') ? 'text-red-500' :
          isNumeric ? 'text-gray-800 text-right' : 'text-gray-800'
        }`}>
          {displayValue}
        </span>
      )}
    </td>
  )
})

// ── Spreadsheet ──────────────────────────────────────────────────────────────
export default function Spreadsheet() {
  const {
    selectedCell, editingCell,
    getCellValue, getComputedValue, setCell, selectCell, startEditing, stopEditing,
    cellRef,
  } = useSpreadsheet()

  const containerRef = useRef<HTMLDivElement>(null)

  // Navigate with arrow keys / Enter / Tab / Escape
  const handleKeyDown = useCallback((
    e: KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    const isEditing = true // always called from editing state

    if (e.key === 'Escape') {
      e.preventDefault()
      stopEditing()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      stopEditing()
      const nextRow = Math.min(row + 1, ROWS - 1)
      selectCell({ row: nextRow, col })
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      stopEditing()
      const nextCol = e.shiftKey ? Math.max(col - 1, 0) : Math.min(col + 1, COLS - 1)
      selectCell({ row, col: nextCol })
      return
    }
  }, [stopEditing, selectCell])

  // Container key handler (when a cell is selected but not editing)
  const handleContainerKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!selectedCell || editingCell) return

    const { row, col } = selectedCell

    const arrowMap: Record<string, [number, number]> = {
      ArrowUp:    [-1,  0],
      ArrowDown:  [ 1,  0],
      ArrowLeft:  [ 0, -1],
      ArrowRight: [ 0,  1],
    }

    if (arrowMap[e.key]) {
      e.preventDefault()
      const [dr, dc] = arrowMap[e.key]
      const newRow = Math.max(0, Math.min(ROWS - 1, row + dr))
      const newCol = Math.max(0, Math.min(COLS - 1, col + dc))
      selectCell({ row: newRow, col: newCol })
      return
    }

    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      startEditing(selectedCell)
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      setCell(row, col, '')
      return
    }

    // Start editing on printable char
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setCell(row, col, e.key)
      startEditing(selectedCell)
    }
  }, [selectedCell, editingCell, selectCell, startEditing, setCell])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto outline-none"
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onClick={() => containerRef.current?.focus()}
    >
      <table className="border-collapse border-spacing-0" style={{ tableLayout: 'fixed' }}>
        {/* Column headers */}
        <thead>
          <tr>
            {/* # corner */}
            <th
              className="sticky top-0 left-0 z-20 w-10 h-7 bg-gray-50 border-r border-b border-gray-200 text-[11px] font-semibold text-gray-400 text-center"
              style={{ minWidth: 40 }}
            >
              #
            </th>
            {Array.from({ length: COLS }, (_, col) => (
              <th
                key={col}
                className={`sticky top-0 z-10 h-7 bg-gray-50 border-r border-b border-gray-200 text-[11px] font-semibold text-center ${
                  selectedCell?.col === col ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500'
                }`}
                style={{ minWidth: 100 }}
              >
                {colLetter(col)}
              </th>
            ))}
          </tr>
        </thead>

        {/* Rows */}
        <tbody>
          {Array.from({ length: ROWS }, (_, row) => (
            <tr key={row}>
              {/* Row number */}
              <td
                className={`sticky left-0 z-10 w-10 h-7 bg-gray-50 border-r border-b border-gray-200 text-[11px] font-medium text-center select-none ${
                  selectedCell?.row === row ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400'
                }`}
              >
                {row + 1}
              </td>

              {/* Data cells */}
              {Array.from({ length: COLS }, (_, col) => {
                const isSelected = selectedCell?.row === row && selectedCell?.col === col
                const isEditing = editingCell?.row === row && editingCell?.col === col
                return (
                  <Cell
                    key={col}
                    row={row}
                    col={col}
                    rawValue={getCellValue(row, col)}
                    displayValue={getComputedValue(row, col)}
                    isSelected={isSelected}
                    isEditing={isEditing}
                    onSelect={selectCell}
                    onStartEdit={startEditing}
                    onChange={setCell}
                    onKeyDown={handleKeyDown}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
