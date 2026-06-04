import { useState, useRef, useCallback } from 'react'
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { toTitleCase } from '../lib/utils'

const MIN_WIDTH = 260
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 288

export function SettingsSidebar({ open, onClose, categories, paymentMethods, exchangeRates,
  transactionTypes, user, onLogout,
  onAddCategory, onRenameCategory, onDeleteCategory,
  onAddPaymentMethod, onRenamePaymentMethod, onDeletePaymentMethod,
  onUpdateExchangeRate, onDeleteExchangeRate,
  onAddTransactionType, onRenameTransactionType, onDeleteTransactionType, onToggleTransactionTypeIncome,
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragRef = useRef(null)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width

    function onMove(e) {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + e.clientX - startX))
      setWidth(newWidth)
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={dragRef}
        style={{ width }}
        className={`fixed top-0 left-0 z-50 h-full bg-gray-950 border-r border-white/10 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Drag handle */}
        <div
          onMouseDown={onMouseDown}
          className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize hover:bg-blue-500/40 transition-colors z-10"
          title="Drag to resize"
        />
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          <Section title="Categories">
            <ManageList
              items={categories}
              onAdd={onAddCategory}
              onRename={onRenameCategory}
              onDelete={onDeleteCategory}
              placeholder="New category"
            />
          </Section>

          <Section title="Payment Methods">
            <ManageList
              items={paymentMethods}
              onAdd={onAddPaymentMethod}
              onRename={onRenamePaymentMethod}
              onDelete={onDeletePaymentMethod}
              placeholder="New payment method"
            />
          </Section>

          <Section title="Transaction Types">
            <p className="text-xs text-gray-500 mb-2">Click the toggle to switch a type between Expense (red) and Income (green).</p>
            <TransactionTypeList
              types={transactionTypes}
              onAdd={onAddTransactionType}
              onRename={onRenameTransactionType}
              onDelete={onDeleteTransactionType}
              onToggleIncome={onToggleTransactionTypeIncome}
            />
          </Section>

          <Section title="Exchange Rates">
            <p className="text-xs text-gray-500 mb-2">USD base. Enter how many USD = 1 unit of the currency.</p>
            <ExchangeRateList rates={exchangeRates} onUpdate={onUpdateExchangeRate} onDelete={onDeleteExchangeRate} />
          </Section>

        </div>

        {/* User + sign out */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center gap-3">
          <SidebarAvatar user={user} />
          <span className="flex-1 text-sm text-gray-300 truncate">{user?.name || user?.email || 'User'}</span>
          <button
            onClick={() => { onLogout(); window.close() }}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors whitespace-nowrap"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function ManageList({ items, onAdd, onRename, onDelete, placeholder }) {
  const [newName, setNewName] = useState('')

  function handleAdd() {
    const name = newName.trim()
    if (!name || items.includes(name)) return
    onAdd(name)
    setNewName('')
  }

  return (
    <div className="space-y-1">
      {items.map(item => (
        <ManageRow key={item} name={item} onRename={n => onRename(item, n)} onDelete={() => onDelete(item)} />
      ))}
      <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          className="flex-1 bg-gray-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 rounded-lg transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

function ManageRow({ name, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)

  function confirm() {
    const trimmed = val.trim()
    if (trimmed && trimmed !== name) onRename(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 bg-gray-900 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
        />
        <button onClick={confirm} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5">
      <span className="flex-1 text-sm text-gray-300">{name}</span>
      <button onClick={() => { setVal(name); setEditing(true) }} className="text-gray-500 hover:text-white transition-colors">
        <Pencil size={13} />
      </button>
      <button onClick={onDelete} className="text-gray-500 hover:text-red-400 transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function TransactionTypeList({ types, onAdd, onRename, onDelete, onToggleIncome }) {
  const [newName, setNewName] = useState('')
  const [newIsIncome, setNewIsIncome] = useState(false)

  function handleAdd() {
    const name = newName.trim()
    if (!name || types.some(t => t.name === name)) return
    onAdd(name, newIsIncome ? 1 : 0)
    setNewName('')
    setNewIsIncome(false)
  }

  return (
    <div className="space-y-1">
      {types.map(t => (
        <TransactionTypeRow
          key={t.name}
          type={t}
          onRename={newName => onRename(t.name, newName)}
          onDelete={() => onDelete(t.name)}
          onToggleIncome={() => {
              // Cycle: Expense → Income → Transfer → Expense
              if (t.is_transfer) onToggleIncome(t.name, 0, 0)        // transfer → expense
              else if (t.is_income) onToggleIncome(t.name, 0, 1)     // income → transfer
              else onToggleIncome(t.name, 1, 0)                      // expense → income
            }}
        />
      ))}
      <div className="flex gap-2 mt-2 pt-2 border-t border-white/5 items-center">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="New type"
          className="flex-1 bg-gray-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => setNewIsIncome(v => !v)}
          className={`flex items-center gap-1 text-xs cursor-pointer shrink-0 whitespace-nowrap ${newIsIncome ? 'text-green-400' : 'text-red-400'}`}
        >
          <span className={`inline-flex w-4 h-4 rounded border-2 items-center justify-center shrink-0 ${newIsIncome ? 'bg-green-500 border-green-500' : 'bg-red-500/20 border-red-500'}`}>
            {newIsIncome
              ? <Check size={9} className="text-white" strokeWidth={3} />
              : <X size={9} className="text-red-400" strokeWidth={3} />
            }
          </span>
          {newIsIncome ? 'Income' : 'Expense'}
        </button>
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 rounded-lg transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

function TransactionTypeRow({ type, onRename, onDelete, onToggleIncome }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(type.name)

  function confirm() {
    const trimmed = val.trim()
    if (trimmed && trimmed !== type.name) onRename(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 bg-gray-900 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
        />
        <button onClick={confirm} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5">
      <span className="flex-1 text-sm text-gray-300">{type.name}</span>
      <button
        type="button"
        onClick={onToggleIncome}
        className={`flex items-center gap-1 text-xs cursor-pointer shrink-0 ${
          type.is_transfer ? 'text-gray-400' : type.is_income ? 'text-green-400' : 'text-red-400'
        }`}
        title="Click to cycle: Expense → Income → Transfer"
      >
        <span className={`inline-flex w-4 h-4 rounded border-2 items-center justify-center shrink-0 ${
          type.is_transfer ? 'bg-gray-600 border-gray-500' :
          type.is_income  ? 'bg-green-500 border-green-500' : 'bg-red-500/20 border-red-500'
        }`}>
          {type.is_transfer
            ? <span className="text-gray-300 text-[8px] font-bold leading-none">⇄</span>
            : type.is_income
              ? <Check size={9} className="text-white" strokeWidth={3} />
              : <X size={9} className="text-red-400" strokeWidth={3} />
          }
        </span>
        {type.is_transfer ? 'Transfer' : type.is_income ? 'Income' : 'Expense'}
      </button>
      <button onClick={() => { setVal(type.name); setEditing(true) }} className="text-gray-500 hover:text-white transition-colors">
        <Pencil size={13} />
      </button>
      <button onClick={onDelete} className="text-gray-500 hover:text-red-400 transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function ExchangeRateList({ rates, onUpdate, onDelete }) {
  const [newCurrency, setNewCurrency] = useState('')
  const [newRate, setNewRate] = useState('')

  function handleAdd() {
    const currency = newCurrency.trim().toUpperCase()
    const rate = parseFloat(newRate)
    if (!currency || isNaN(rate) || rate <= 0) return
    onUpdate(currency, rate)
    setNewCurrency('')
    setNewRate('')
  }

  return (
    <div className="space-y-1">
      {Object.entries(rates).map(([currency, rate]) => (
        <ExchangeRateRow key={currency} currency={currency} rate={rate} onUpdate={onUpdate} onDelete={() => onDelete(currency)} />
      ))}
      <div className="flex gap-2 mt-2 pt-2 border-t border-white/5 items-center">
        <input
          value={newCurrency}
          onChange={e => setNewCurrency(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="COP"
          maxLength={5}
          className="w-16 bg-gray-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
        />
        <input
          value={newRate}
          onChange={e => setNewRate(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Rate"
          type="number"
          step="any"
          min="0"
          className="flex-1 bg-gray-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newCurrency.trim() || !newRate.trim()}
          className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 rounded-lg transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

function ExchangeRateRow({ currency, rate, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(rate))

  function confirm() {
    const parsed = parseFloat(val)
    if (!isNaN(parsed) && parsed > 0) onUpdate(currency, parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="w-10 text-sm font-mono text-gray-400 shrink-0">{currency}</span>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 bg-gray-900 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
        />
        <button onClick={confirm} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5">
      <span className="w-10 text-sm font-mono text-gray-400 shrink-0">{currency}</span>
      <span className="flex-1 text-sm text-gray-300">{rate}</span>
      <button onClick={() => { setVal(String(rate)); setEditing(true) }} className="text-gray-500 hover:text-white transition-colors">
        <Pencil size={13} />
      </button>
      <button onClick={onDelete} className="text-gray-500 hover:text-red-400 transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function SidebarAvatar({ user }) {
  const [imgFailed, setImgFailed] = useState(false)
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email
      ? user.email[0].toUpperCase()
      : '?'

  if (user?.picture && !imgFailed) {
    return (
      <img
        src={user.picture}
        alt={user?.name}
        className="w-8 h-8 rounded-full object-cover shrink-0"
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
      {initials}
    </div>
  )
}

