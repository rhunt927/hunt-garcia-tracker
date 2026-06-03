import { useRef, useState } from 'react'
import { Upload, X, CheckSquare, Square, AlertTriangle } from 'lucide-react'
import { parseCSV } from '../lib/csvParsers'
import { toTitleCase } from '../lib/utils'
import { CategorySelect } from './CategorySelect'

export function CSVImport({ categories, existingExpenses, onImport, onClose, onAddCategory, onRenameCategory, onDeleteCategory }) {
  const inputRef = useRef(null)
  const [bankName, setBankName] = useState(null)
  const [rows, setRows] = useState([])       // { ...parsed, id, selected, isDuplicate, category }
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)

  function isDuplicate(row) {
    return existingExpenses.some(e =>
      e.date === row.date &&
      e.amount_usd === row.amount_usd &&
      e.merchant?.toLowerCase() === row.merchant?.toLowerCase()
    )
  }

  async function handleFile(file) {
    if (!file) return
    setError(null)
    try {
      const { rows: parsed, bankName: bank } = await parseCSV(file)
      setBankName(bank)
      setRows(parsed.map(r => ({
        ...r,
        _id: crypto.randomUUID(),
        selected: true,
        isDuplicate: isDuplicate(r),
        category: r.category ?? 'other',
      })))
    } catch (e) {
      setError(e.message)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  function toggleRow(id) {
    setRows(rs => rs.map(r => r._id === id ? { ...r, selected: !r.selected } : r))
  }

  function toggleAll() {
    const nonDupes = rows.filter(r => !r.isDuplicate)
    const allSelected = nonDupes.every(r => r.selected)
    setRows(rs => rs.map(r => r.isDuplicate ? r : { ...r, selected: !allSelected }))
  }

  function setCategory(id, category) {
    setRows(rs => rs.map(r => r._id === id ? { ...r, category } : r))
  }

  function handleImport() {
    const toImport = rows
      .filter(r => r.selected && !r.isDuplicate)
      .map(r => {
        const now = new Date().toISOString()
        return {
          id: crypto.randomUUID(),
          date: r.date,
          merchant: r.merchant ?? null,
          description: r.description ?? null,
          amount: r.amount,
          currency: r.currency,
          amount_usd: r.amount_usd,
          category: r.category,
          payment_method: r.payment_method ?? null,
          receipt_filename: null,
          source: r.source,
          notes: null,
          created_at: now,
          updated_at: now,
        }
      })
    onImport(toImport)
  }

  const selectableRows = rows.filter(r => !r.isDuplicate)
  const selectedCount = selectableRows.filter(r => r.selected).length
  const total = rows
    .filter(r => r.selected && !r.isDuplicate)
    .reduce((s, r) => s + r.amount_usd, 0)

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-white/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import CSV</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Drop zone */}
      {rows.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-white/20'
          }`}
        >
          <Upload size={32} className="mx-auto mb-3 text-gray-500" />
          <p className="text-sm text-gray-400">Drop a CSV file here, or click to browse</p>
          <p className="text-xs text-gray-600 mt-1">Apple Card, Chase, Discover, BofA, Schwab</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {error && (
        <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 rounded-lg p-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              <span className="text-white font-medium">{bankName}</span>
              {' · '}{rows.length} transactions
              {rows.filter(r => r.isDuplicate).length > 0 && (
                <span className="text-yellow-500 ml-2">
                  ({rows.filter(r => r.isDuplicate).length} duplicates skipped)
                </span>
              )}
            </span>
            <button
              onClick={() => { setBankName(null); setRows([]); setError(null) }}
              className="text-gray-500 hover:text-white transition-colors text-xs"
            >
              Change file
            </button>
          </div>

          <div className="overflow-auto max-h-72 rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900 border-b border-white/10">
                <tr>
                  <th className="px-3 py-2 text-left w-8">
                    <button onClick={toggleAll}>
                      {selectableRows.every(r => r.selected)
                        ? <CheckSquare size={15} className="text-blue-400" />
                        : <Square size={15} className="text-gray-500" />}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-gray-400 font-normal">Date</th>
                  <th className="px-3 py-2 text-left text-gray-400 font-normal">Merchant</th>
                  <th className="px-3 py-2 text-left text-gray-400 font-normal">Category</th>
                  <th className="px-3 py-2 text-right text-gray-400 font-normal">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map(row => (
                  <tr
                    key={row._id}
                    className={row.isDuplicate ? 'opacity-40' : ''}
                  >
                    <td className="px-3 py-2">
                      {row.isDuplicate ? (
                        <span title="Duplicate" className="text-yellow-600">
                          <AlertTriangle size={13} />
                        </span>
                      ) : (
                        <button onClick={() => toggleRow(row._id)}>
                          {row.selected
                            ? <CheckSquare size={15} className="text-blue-400" />
                            : <Square size={15} className="text-gray-500" />}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{row.date}</td>
                    <td className="px-3 py-2 text-white max-w-[180px] truncate">{row.merchant}</td>
                    <td className="px-3 py-2">
                      {row.isDuplicate ? (
                        <span className="text-xs text-gray-600">{toTitleCase(row.category)}</span>
                      ) : (
                        <CategorySelect
                          value={row.category}
                          onChange={cat => setCategory(row._id, cat)}
                          categories={categories}
                          onAdd={onAddCategory}
                          onRename={onRenameCategory}
                          onDelete={onDeleteCategory}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-green-400 whitespace-nowrap">
                      ${row.amount_usd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-gray-400">
              {selectedCount} selected · <span className="text-white">${total.toFixed(2)}</span>
            </span>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Import {selectedCount > 0 ? `${selectedCount} expenses` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
