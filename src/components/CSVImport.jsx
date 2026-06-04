import { useRef, useState } from 'react'
import { Upload, X, CheckSquare, Square, AlertTriangle } from 'lucide-react'
import { parseCSV } from '../lib/csvParsers'
import { parsePDF } from '../lib/pdfParser'
import { toTitleCase } from '../lib/utils'
import { CategorySelect } from './CategorySelect'
import { ExpenseForm } from './ExpenseForm'

export function CSVImport({
  categories, existingExpenses, onImport, onClose,
  paymentMethods, exchangeRates, transactionTypes,
  onAddCategory, onRenameCategory, onDeleteCategory,
}) {
  const inputRef = useRef(null)
  const [bankName, setBankName] = useState(null)
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  function defaultCategory() {
    return categories.find(c => c.toLowerCase() === 'other') ?? categories[0] ?? ''
  }

  function isDuplicate(row) {
    return existingExpenses.some(e =>
      e.date === row.date &&
      e.amount_usd === row.amount_usd &&
      e.merchant?.toLowerCase() === row.merchant?.toLowerCase()
    )
  }

  function defaultType(isCredit) {
    if (isCredit) {
      return transactionTypes?.find(t => t.is_income)?.name ?? 'Income'
    }
    return transactionTypes?.find(t => !t.is_income)?.name ?? 'Expense'
  }

  async function handleFile(file) {
    if (!file) return
    setError(null)
    try {
      const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
      const { rows: parsed, bankName: bank } = isPDF ? await parsePDF(file) : await parseCSV(file)
      setBankName(bank)
      setRows(parsed.map(r => ({
        ...r,
        _id: crypto.randomUUID(),
        selected: true,
        isDuplicate: isDuplicate(r),
        category: r.category ?? defaultCategory(),
        type: r.type ?? defaultType(r.isCredit),
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

  function typeFlags(typeName) {
    const t = (transactionTypes ?? []).find(t => t.name === typeName)
    return { isCredit: !!(t?.is_income && !t?.is_transfer), isTransfer: !!t?.is_transfer }
  }

  function setCategory(id, category) {
    setRows(rs => rs.map(r => r._id === id ? { ...r, category } : r))
  }

  function setType(id, type) {
    setRows(rs => rs.map(r => r._id === id ? { ...r, type, ...typeFlags(type) } : r))
  }

  function handleEditRowSave(expense) {
    setRows(rs => rs.map(r => r._id === editingRow._id ? {
      ...r,
      date: expense.date,
      merchant: expense.merchant,
      description: expense.description,
      amount: expense.amount,
      currency: expense.currency,
      amount_usd: expense.amount_usd,
      type: expense.type,
      ...typeFlags(expense.type),
      category: expense.category,
      payment_method: expense.payment_method,
      notes: expense.notes,
      isDuplicate: isDuplicate({ date: expense.date, amount_usd: expense.amount_usd, merchant: expense.merchant }),
    } : r))
    setEditingRow(null)
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
          type: r.type ?? 'Expense',
          category: r.category,
          payment_method: r.payment_method ?? null,
          receipt_filename: null,
          source: r.source,
          notes: r.notes ?? null,
          created_at: now,
          updated_at: now,
        }
      })
    onImport(toImport)
  }

  // Show full ExpenseForm when editing a row
  if (editingRow) {
    return (
      <ExpenseForm
        categories={categories}
        paymentMethods={paymentMethods}
        exchangeRates={exchangeRates}
        transactionTypes={transactionTypes}
        initialValues={{
          id: editingRow._id,
          date: editingRow.date,
          merchant: editingRow.merchant ?? '',
          description: editingRow.description ?? '',
          amount: editingRow.amount,
          currency: editingRow.currency ?? 'USD',
          type: editingRow.type ?? transactionTypes?.[0]?.name ?? 'Expense',
          category: editingRow.category,
          payment_method: editingRow.payment_method ?? '',
          notes: editingRow.notes ?? '',
          source: editingRow.source,
        }}
        onSave={handleEditRowSave}
        onCancel={() => setEditingRow(null)}
        onAddCategory={onAddCategory}
        onRenameCategory={onRenameCategory}
        onDeleteCategory={onDeleteCategory}
      />
    )
  }

  const selectableRows = rows.filter(r => !r.isDuplicate)
  const selectedCount = selectableRows.filter(r => r.selected).length
  const total = rows
    .filter(r => r.selected && !r.isDuplicate)
    .reduce((s, r) => s + r.amount_usd, 0)

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-white/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import</h2>
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
          <p className="text-sm text-gray-400">Drop a file here, or tap to browse</p>
          <p className="text-xs text-gray-600 mt-1">CSV: Apple Card, Chase, Discover, BofA, Schwab</p>
          <p className="text-xs text-gray-600">PDF: Schwab, BofA, Chase, Discover</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf"
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
                  <th className="px-3 py-2 text-left text-gray-400 font-normal">Type</th>
                  <th className="px-3 py-2 text-left text-gray-400 font-normal">Category</th>
                  <th className="px-3 py-2 text-right text-gray-400 font-normal">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map(row => (
                  <tr key={row._id} className={row.isDuplicate ? 'opacity-40' : 'cursor-pointer'}>
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
                    <td
                      className="px-3 py-2 text-gray-400 whitespace-nowrap hover:text-white transition-colors"
                      onClick={() => !row.isDuplicate && setEditingRow(row)}
                    >
                      {row.date}
                    </td>
                    <td
                      className="px-3 py-2 text-white max-w-[140px] truncate hover:text-blue-300 transition-colors"
                      onClick={() => !row.isDuplicate && setEditingRow(row)}
                    >
                      {row.merchant}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      {row.isDuplicate ? (
                        <span className="text-xs text-gray-600">{row.type}</span>
                      ) : (
                        <select
                          value={row.type ?? ''}
                          onChange={e => setType(row._id, e.target.value)}
                          className="bg-gray-800 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          {(transactionTypes ?? []).map(t => (
                            <option key={t.name} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
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
                    <td
                      className={`px-3 py-2 text-right whitespace-nowrap transition-colors ${
                        row.isCredit ? 'text-green-400 hover:text-green-300' :
                        row.isTransfer ? 'text-gray-400 hover:text-gray-300' :
                        'text-red-400 hover:text-red-300'
                      }`}
                      onClick={() => !row.isDuplicate && setEditingRow(row)}
                    >
                      {row.isCredit ? '+' : ''}{row.currency !== 'USD' ? `${row.amount.toFixed(2)} ${row.currency}` : `$${row.amount_usd.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-600 text-center">Tap a row to edit details</div>

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
