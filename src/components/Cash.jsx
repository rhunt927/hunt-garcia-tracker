import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, Pencil, Trash2, Check, X, Plus } from 'lucide-react'

export function Cash({ entries, onAdd, onUpdate, onDelete, onBack }) {
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

  const total = entries.reduce((s, e) => s + (e.amount ?? 0), 0)

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
        <p className="text-sm text-teal-400 font-medium mb-1">Cash on Hand</p>
        <p className="text-4xl font-bold text-white">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <p className="text-xs text-gray-500 mt-1">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
      </div>

      {/* Entry list */}
      <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
        {entries.length === 0 && (
          <p className="px-4 py-5 text-sm text-gray-500 text-center">No cash entries yet. Add one below.</p>
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
                <span className="text-sm font-semibold text-teal-300 tabular-nums">${entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
  )
}
