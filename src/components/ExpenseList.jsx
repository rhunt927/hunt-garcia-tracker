import { useState } from 'react'
import { Search, Pencil, Trash2, Plus, FileUp, CheckSquare, Square, ChevronLeft, RefreshCw } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toTitleCase } from '../lib/utils'

export function ExpenseList({ expenses, categories, transactionTypes, onAdd, onEdit, onDelete, onBulkDelete, onImportCSV, onBack, initialFrom, initialTo, initialFilterType }) {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterType, setFilterType] = useState(initialFilterType || 'all')
  const [dateFrom, setDateFrom] = useState(initialFrom || '')
  const [dateTo, setDateTo] = useState(initialTo || '')
  const [selected, setSelected] = useState(new Set())
  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  function toggleSort(field) {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const incomeTypeNames = new Set((transactionTypes ?? []).filter(t => t.is_income && !t.is_transfer).map(t => t.name))
  const transferTypeNames = new Set((transactionTypes ?? []).filter(t => t.is_transfer).map(t => t.name))

  const filtered = expenses.filter(e => {
    const matchesSearch = !search ||
      [e.merchant, e.description, e.notes, e.category, e.payment_method]
        .some(v => v?.toLowerCase().includes(search.toLowerCase()))
    const matchesCategory = filterCategory === 'all' || e.category === filterCategory
    const matchesType = filterType === 'all'
      ? true
      : filterType === '__income__' ? incomeTypeNames.has(e.type)
      : filterType === '__expense__' ? (!incomeTypeNames.has(e.type) && !transferTypeNames.has(e.type))
      : e.type === filterType
    const matchesFrom = !dateFrom || e.date >= dateFrom
    const matchesTo = !dateTo || e.date <= dateTo
    return matchesSearch && matchesCategory && matchesType && matchesFrom && matchesTo
  }).sort((a, b) => {
    let cmp = 0
    if (sortBy === 'date') cmp = (a.date ?? '').localeCompare(b.date ?? '')
    else if (sortBy === 'category') cmp = (a.category ?? '').localeCompare(b.category ?? '')
    else if (sortBy === 'type') cmp = (a.type ?? '').localeCompare(b.type ?? '')
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalIncome = filtered.filter(e => incomeTypeNames.has(e.type)).reduce((s, e) => s + (e.amount_usd ?? 0), 0)
  const totalExpenses = filtered.filter(e => !incomeTypeNames.has(e.type) && !transferTypeNames.has(e.type)).reduce((s, e) => s + (e.amount_usd ?? 0), 0)
  const net = totalIncome - totalExpenses

  const selectedTotal = filtered
    .filter(e => selected.has(e.id))
    .reduce((sum, e) => {
      const sign = incomeTypeNames.has(e.type) ? 1 : -1
      return sum + sign * (e.amount_usd ?? 0)
    }, 0)

  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selected.has(e.id))

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(s => { const n = new Set(s); filtered.forEach(e => n.delete(e.id)); return n })
    } else {
      setSelected(s => { const n = new Set(s); filtered.forEach(e => n.add(e.id)); return n })
    }
  }

  function toggleOne(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleBulkDelete() {
    const ids = [...selected].filter(id => filtered.some(e => e.id === id))
    if (!ids.length) return
    if (!window.confirm(`Delete ${ids.length} transaction${ids.length === 1 ? '' : 's'}?`)) return
    await onBulkDelete(ids)
    setSelected(new Set())
  }

  return (
    <div className="space-y-4">
      {/* Back + toolbar */}
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors -mb-1">
          <ChevronLeft size={16} /> Dashboard
        </button>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search expenses..."
            className="w-full bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All types</option>
          <option value="__income__">All Income</option>
          <option value="__expense__">All Expenses</option>
          {(transactionTypes ?? []).map(t => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={onImportCSV}
          className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap border border-white/10"
          title="Import"
        >
          <FileUp size={16} />
        </button>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <Plus size={16} />
          Add
        </button>
      </div>

      {/* Date range row */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">From</span>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="flex-1 bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
        <span className="text-xs text-gray-500 shrink-0">To</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="flex-1 bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-xs text-gray-500 hover:text-white transition-colors shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary / bulk action bar */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {/* Select-all + bulk delete */}
          <div className="flex items-center justify-between text-sm px-1">
            <button onClick={toggleAll} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
              {allFilteredSelected
                ? <CheckSquare size={15} className="text-blue-400" />
                : <Square size={15} />}
              <span>{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}`}</span>
            </button>
            {selected.size > 0 && (
              <div className="flex items-center gap-3">
                <span className={`font-medium ${selectedTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedTotal >= 0 ? '+' : ''}${Math.abs(selectedTotal).toFixed(2)}
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors font-medium"
                >
                  <Trash2 size={14} />
                  Delete {selected.size}
                </button>
              </div>
            )}
          </div>

          {/* Income / Expenses / Net summary */}
          {filtered.length > 0 && selected.size === 0 && (
            <div className="flex gap-3 text-sm px-1">
              {totalIncome > 0 && (
                <span className="text-green-400">↑ ${totalIncome.toFixed(2)}</span>
              )}
              {totalExpenses > 0 && (
                <span className="text-gray-400">↓ ${totalExpenses.toFixed(2)}</span>
              )}
              {totalIncome > 0 && totalExpenses > 0 && (
                <span className={`font-semibold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  Net {net >= 0 ? '+' : ''}${net.toFixed(2)}
                </span>
              )}
              {totalIncome === 0 && (
                <span className="text-white font-medium">${totalExpenses.toFixed(2)} USD</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sort bar */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span className="mr-1">Sort:</span>
          {[['date', 'Date'], ['category', 'Category'], ['type', 'Type']].map(([field, label]) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`px-2 py-1 rounded transition-colors ${sortBy === field ? 'text-white bg-gray-700' : 'hover:text-white'}`}
            >
              {label} {sortBy === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl border border-white/10 p-8 text-center text-gray-500 text-sm">
          {expenses.length === 0 ? 'No expenses yet. Add your first one!' : 'No results match your search.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <ExpenseRow
              key={e.id}
              expense={e}
              selected={selected.has(e.id)}
              isIncome={incomeTypeNames.has(e.type)}
              isTransfer={transferTypeNames.has(e.type)}
              onToggle={() => toggleOne(e.id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ExpenseRow({ expense: e, selected, isIncome, isTransfer, onToggle, onEdit, onDelete }) {
  let dateLabel = e.date
  try { dateLabel = format(parseISO(e.date), 'MMM d, yyyy') } catch {}

  const amountColor = isIncome ? 'text-green-400' : isTransfer ? 'text-gray-400' : 'text-red-400'
  const amountPrefix = isIncome ? '+' : ''

  return (
    <div className={`bg-gray-900/80 backdrop-blur-sm rounded-xl border px-4 py-3 flex items-start gap-3 transition-colors ${selected ? 'border-blue-500/50 bg-blue-900/10' : 'border-white/10'}`}>
      <button onClick={onToggle} className="mt-0.5 shrink-0 text-gray-500 hover:text-white transition-colors">
        {selected ? <CheckSquare size={15} className="text-blue-400" /> : <Square size={15} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-white truncate">{e.merchant || e.description || 'Untitled'}</span>
          <span className={`${amountColor} font-semibold whitespace-nowrap`}>
            {amountPrefix}{e.currency !== 'USD'
              ? `${e.amount.toFixed(2)} ${e.currency}`
              : `$${e.amount_usd.toFixed(2)}`}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500">{dateLabel}</span>
          {e.type && e.type !== 'expense' && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              isTransfer ? 'bg-gray-700/50 text-gray-500 border border-gray-600/50' :
              isIncome   ? 'bg-green-900/50 text-green-400' :
                           'bg-gray-800 text-gray-400'
            }`}>
              {e.type}
            </span>
          )}
          {e.category && (
            <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
              {e.category}
            </span>
          )}
          {e.is_recurring ? <RefreshCw size={11} className="text-purple-400 shrink-0" title="Recurring" /> : null}
          {e.payment_method && (
            <span className="text-xs text-gray-600">{e.payment_method}</span>
          )}
          {e.currency !== 'USD' && (
            <span className="text-xs text-gray-600">≈ ${e.amount_usd.toFixed(2)} USD</span>
          )}
        </div>
        {e.notes && <p className="text-xs text-gray-600 mt-1 truncate">{e.notes}</p>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(e)}
          className="p-1.5 text-gray-500 hover:text-white transition-colors"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete "${e.merchant || e.description || 'this transaction'}"?`)) onDelete(e.id)
          }}
          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
