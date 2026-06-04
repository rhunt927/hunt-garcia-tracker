import { useState, useRef, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { toTitleCase } from '../lib/utils'

export function CategorySelect({ value, onChange, categories, onAdd, className = '' }) {
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (addingNew) inputRef.current?.focus()
  }, [addingNew])

  function handleSelectChange(e) {
    if (e.target.value === '__new__') {
      setAddingNew(true)
    } else {
      onChange(e.target.value)
    }
  }

  function confirmAdd() {
    const name = newName.trim()
    if (!name) { setAddingNew(false); setNewName(''); return }
    if (!categories.includes(name) && onAdd) onAdd(name)
    onChange(name)   // always update selection whether category is new or existing
    setAddingNew(false)
    setNewName('')
  }

  if (addingNew) {
    return (
      <div className="flex gap-1 items-center">
        <input
          ref={inputRef}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') { setAddingNew(false); setNewName('') } }}
          placeholder="category name"
          className="flex-1 min-w-0 bg-gray-800 border border-blue-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
        />
        <button onClick={confirmAdd} className="text-green-400 hover:text-green-300 p-0.5"><Check size={13} /></button>
        <button onClick={() => { setAddingNew(false); setNewName('') }} className="text-gray-500 hover:text-white p-0.5"><X size={13} /></button>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={handleSelectChange}
      className={`bg-gray-800 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500 ${className}`}
    >
      {categories.map(c => (
        <option key={c} value={c}>{c}</option>
      ))}
      <option value="__new__">＋ Add category…</option>
    </select>
  )
}
