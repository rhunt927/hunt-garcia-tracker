import { useRef, useState } from 'react'
import { Upload, X, CheckSquare, Square, AlertTriangle, HardDrive, FolderOpen } from 'lucide-react'
import { parseCSV, parseTxt } from '../lib/csvParsers'
import { parsePDF } from '../lib/pdfParser'
import { toTitleCase } from '../lib/utils'
import { CategorySelect } from './CategorySelect'
import { ExpenseForm } from './ExpenseForm'

export function CSVImport({
  categories, existingExpenses, onImport, onClose,
  paymentMethods, exchangeRates, transactionTypes, accessToken,
  onAddCategory, onRenameCategory, onDeleteCategory,
}) {
  const inputRef = useRef(null)
  const [bankName, setBankName] = useState(null)
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [driveOpen, setDriveOpen] = useState(false)
  const [driveItems, setDriveItems] = useState({ folders: [], files: [] })
  const [driveLoading, setDriveLoading] = useState(false)

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
      const name = file.name.toLowerCase()
      const isPDF = name.endsWith('.pdf') || file.type === 'application/pdf'
      const isTxt = name.endsWith('.txt') || file.type === 'text/plain'
      const { rows: parsed, bankName: bank } = isPDF ? await parsePDF(file) : isTxt ? await parseTxt(file) : await parseCSV(file)
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

  async function browseDrive() {
    if (!accessToken) return
    setDriveLoading(true)
    setDriveOpen(true)
    setError(null)
    try {
      // Find the ExpenseTracker folder (same one used for the DB)
      const folderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name='ExpenseTracker' and mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (folderRes.status === 401 || folderRes.status === 403)
        throw new Error('Drive access needs to be refreshed — please sign out and sign back in, then try again.')
      if (!folderRes.ok) throw new Error('Could not access Drive')
      const { files: folders } = await folderRes.json()
      const folderId = folders.length > 0 ? folders[0].id : 'root'

      const q = encodeURIComponent(
        `'${folderId}' in parents and trashed=false and (mimeType='text/csv' or mimeType='application/pdf' or mimeType='text/plain')`
      )
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) throw new Error('Could not load Drive files')
      const { files } = await res.json()
      setDriveItems({ folders: [], files: files.filter(f => f.name !== 'expenses.db') })
    } catch (e) {
      setError(e.message)
      setDriveOpen(false)
    } finally {
      setDriveLoading(false)
    }
  }

  function closeDrive() {
    setDriveOpen(false)
    setDriveItems({ folders: [], files: [] })
  }

  async function pickDriveFile(file) {
    setDriveOpen(false)
    setDriveLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) throw new Error('Could not download file from Drive')
      const blob = await res.blob()
      const f = new File([blob], file.name, { type: blob.type })
      await handleFile(f)
    } catch (e) {
      setError(e.message)
    } finally {
      setDriveLoading(false)
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
    // Persist any new category to the DB immediately, not just at import time
    if (category && !categories.includes(category)) onAddCategory?.(category)
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

      {/* File picker */}
      {rows.length === 0 && !driveOpen && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              dragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'
            }`}
          >
            <Upload size={28} className="mx-auto mb-2 text-gray-500" />
            <p className="text-xs text-gray-500 mb-4">Drop a CSV or PDF here, or choose a source:</p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl text-sm font-medium transition-colors"
              >
                <FolderOpen size={16} className="text-gray-400" />
                Local File
              </button>
              {accessToken && (
                <button
                  type="button"
                  onClick={browseDrive}
                  disabled={driveLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-500/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <HardDrive size={16} className="text-blue-400" />
                  {driveLoading ? 'Loading…' : 'Google Drive'}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-4">CSV: Apple Card, Chase, Discover, BofA, Schwab, Wells Fargo</p>
            <p className="text-xs text-gray-600">PDF: Schwab, BofA, Chase, Discover</p>
            <p className="text-xs text-gray-600">TXT: BofA statement export</p>
          </div>
        </>
      )}

      {/* Google Drive file browser */}
      {driveOpen && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">ExpenseTracker folder</span>
            <button onClick={closeDrive} className="text-gray-500 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
          {driveLoading ? (
            <p className="text-sm text-gray-500 text-center py-6">Loading…</p>
          ) : driveItems.files.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No CSV or PDF files in your ExpenseTracker folder.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {driveItems.files.map(f => (
                <button
                  key={f.id}
                  onClick={() => pickDriveFile(f)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-800/60 hover:bg-gray-700/60 border border-white/10 rounded-lg text-left transition-colors"
                >
                  <HardDrive size={14} className="text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{f.name}</p>
                    <p className="text-xs text-gray-500">{f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf,.txt"
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
