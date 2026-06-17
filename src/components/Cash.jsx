import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, Pencil, Trash2, Check, X, Plus, ChevronRight } from 'lucide-react'

export function Cash({ entries, bankAccounts, onAdd, onUpdate, onDelete, onBack, onViewNetWorth }) {
  const [editId, setEditId] = useState(null)
  const [editDesc, setEditDesc] = useState('')
  const [editAmt, setEditAmt] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newAmt, setNewAmt] = useState('')
  const newAmtRef = useRef(null)
  const editAmtRef = useRef(null)

  useEffect(() => {
    if (editId) editAmtRef.current?.focus()
  }, [editId])

  const manualTotal = entries.reduce((s, e) => s + (e.amount ?? 0), 0)
  const bankTotal = bankAccounts.reduce((s, a) => s + a.balance, 0)
  const total = bankTotal + manualTotal

  const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmt0 = n => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  function handleAdd() {
    const amt = parseFloat(newAmt)
    if (!newAmt || isNaN(amt) || amt <= 0) return
    onAdd({ description: newDesc.trim() || null, amount: amt })
    setNewDesc('')
    setNewAmt('')
    newAmtRef.current?.focus()
  }

  function startEdit(entry) {
    setEditId(entry.id)
    setEditDesc(entry.description ?? '')
    setEditAmt(String(entry.amount))
  }

  function saveEdit() {
    const amt = parseFloat(editAmt)
    if (!editAmt || isNaN(amt) || amt <= 0) return
    onUpdate(editId, { description: editDesc.trim() || null, amount: amt })
    setEditId(null)
  }

  function cancelEdit() { setEditId(null) }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <ChevronLeft size={16} /> Dashboard
      </button>

      {/* Total header */}
      <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
        <p className="text-sm text-teal-400 font-medium mb-1">Cash & Bank</p>
        <p className="text-4xl font-bold text-white">${fmt(total)}</p>
        {bankTotal > 0 && manualTotal > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            ${fmt0(bankTotal)} bank · ${fmt0(manualTotal)} other
          </p>
        )}
      </div>

      {/* Bank accounts (read-only, from Net Worth) */}
      {bankAccounts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bank Accounts</p>
            <p className="text-xs font-bold text-teal-400">${fmt0(bankTotal)}</p>
          </div>
          <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            {bankAccounts.map((acct, i) => (
              <div key={acct.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{acct.name}</p>
                  {acct.institution && <p className="text-xs text-gray-500">{acct.institution}</p>}
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className="text-sm font-semibold text-teal-300 tabular-nums">${fmt0(acct.balance)}</span>
                  <span className="text-xs text-gray-600 uppercase">{acct.account_type}</span>
                </div>
              </div>
            ))}
            <button
              onClick={onViewNetWorth}
              className="w-full flex items-center justify-between px-4 py-2.5 border-t border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-xs text-gray-500 hover:text-gray-300"
            >
              Edit in Net Worth
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Manual cash entries */}
      <div>
        {(bankAccounts.length > 0 || entries.length > 0) && (
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Other Cash</p>
            {manualTotal > 0 && <p className="text-xs font-bold text-teal-400">${fmt0(manualTotal)}</p>}
          </div>
        )}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
          {entries.length === 0 && bankAccounts.length > 0 && (
            <p className="px-4 py-4 text-sm text-gray-600 text-center">Add physical cash or other unlisted balances below.</p>
          )}
          {entries.length === 0 && bankAccounts.length === 0 && (
            <p className="px-4 py-5 text-sm text-gray-500 text-center">No entries yet. Add one below.</p>
          )}

          {entries.map((entry, i) => (
            editId === entry.id ? (
              <div key={entry.id} className={`flex items-center gap-2 px-4 py-2.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <input
                  type="text"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                  placeholder="Description"
                  className="flex-1 bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-500"
                />
                <div className="relative w-32 shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    ref={editAmtRef}
                    type="number"
                    value={editAmt}
                    onChange={e => setEditAmt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full bg-gray-800 border border-white/10 rounded-lg pl-6 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <button onClick={saveEdit} className="text-teal-400 hover:text-teal-300 transition-colors shrink-0"><Check size={16} /></button>
                <button onClick={cancelEdit} className="text-gray-500 hover:text-white transition-colors shrink-0"><X size={16} /></button>
              </div>
            ) : (
              <div key={entry.id} className={`flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <span className="text-sm text-white flex-1 min-w-0 truncate">{entry.description || <span className="text-gray-600 italic">No description</span>}</span>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  <span className="text-sm font-semibold text-teal-300 tabular-nums">${fmt(entry.amount)}</span>
                  <button onClick={() => startEdit(entry)} className="p-1 text-gray-500 hover:text-white transition-colors"><Pencil size={13} /></button>
                  <button
                    onClick={() => { if (window.confirm(`Remove "${entry.description || 'this entry'}"?`)) onDelete(entry.id) }}
                    className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                  ><Trash2 size={13} /></button>
                </div>
              </div>
            )
          ))}

          {/* Add row */}
          <div className={`flex items-center gap-2 px-4 py-3 ${entries.length > 0 ? 'border-t border-white/10' : ''} bg-white/5`}>
            <input
              type="text"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') newAmtRef.current?.focus() }}
              placeholder="Description"
              className="flex-1 bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-500"
            />
            <div className="relative w-32 shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                ref={newAmtRef}
                type="number"
                value={newAmt}
                onChange={e => setNewAmt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full bg-gray-800 border border-white/10 rounded-lg pl-6 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-500"
              />
            </div>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
