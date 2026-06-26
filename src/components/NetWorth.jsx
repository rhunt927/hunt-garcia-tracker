import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, Pencil, Trash2, Check, X, Plus, Upload } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const ASSET_TYPES = ['Investment', 'Checking', 'Savings', 'Real Estate', 'Other']
const LIABILITY_TYPES = ['Credit Card', 'Loan', 'Mortgage']

function isLiabilityType(t) { return LIABILITY_TYPES.includes(t) }

function groupByType(accounts) {
  return accounts.reduce((acc, a) => {
    acc[a.account_type] = acc[a.account_type] ?? []
    acc[a.account_type].push(a)
    return acc
  }, {})
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

const SUB_SECTION_MAP = {
  'Investments': 'Investment',
  'Cash': 'Cash',
  'Real Estate': 'Real Estate',
  'Other Assets': 'Other',
  'Cards': 'Credit Card',
  'Loans': 'Loan',
}

export function parseNWCSV(text) {
  const lines = text.replace(/^﻿/, '').replace(/^ï»¿/, '').split('\n').map(l => l.trim()).filter(Boolean)

  // Extract "as of date" from header e.g. "Net Worth Summary as of date 06/17/2026"
  let asOfDate = new Date().toISOString().split('T')[0]
  const dateMatch = lines[0]?.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (dateMatch) {
    const [, mm, dd, yyyy] = dateMatch
    asOfDate = `${yyyy}-${mm}-${dd}`
  }

  let is_liability = 0
  let account_type = 'Other'
  const accounts = []

  for (const line of lines) {
    const fields = parseCSVLine(line)
    const f0 = fields[0]?.trim() ?? ''
    const f0up = f0.toUpperCase()

    if (f0up === 'ASSETS') { is_liability = 0; continue }
    if (f0up === 'LIABILITIES') { is_liability = 1; continue }
    if (f0up === 'NETWORTH' || f0up === 'TOTAL ASSETS' || f0up === 'TOTAL LIABILITIES') continue

    const sub = Object.keys(SUB_SECTION_MAP).find(k => f0 === k)
    if (sub) { account_type = SUB_SECTION_MAP[sub]; continue }

    if (fields.length < 4) continue

    const [rawName, lastUpdated, , rawBalance] = fields
    if (!rawName || rawName.toUpperCase().includes('TOTAL') || rawName === 'All Accounts') continue

    const balance = parseFloat(rawBalance.replace(/[$,]/g, ''))
    if (isNaN(balance)) continue

    const parts = rawName.split(' - ')
    const institution = parts.length > 1 ? parts[0].trim() : ''
    const name = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rawName.trim()

    let resolvedType = account_type
    if (account_type === 'Cash') {
      resolvedType = rawName.toLowerCase().includes('saving') ? 'Savings' : 'Checking'
    } else if (account_type === 'Loan') {
      resolvedType = rawName.toLowerCase().includes('mortgage') ? 'Mortgage' : 'Loan'
    }

    // Parse date from "MM/DD/YYYY HH:MM AM/PM TZ"
    let last_updated = new Date().toISOString().split('T')[0]
    if (lastUpdated) {
      const datePart = lastUpdated.split(' ')[0]
      const [mm, dd, yyyy] = datePart.split('/')
      if (yyyy) last_updated = `${yyyy}-${mm}-${dd}`
    }

    accounts.push({ id: crypto.randomUUID(), name, institution, account_type: resolvedType, is_liability, balance, last_updated, sort_order: accounts.length })
  }

  return { accounts, asOfDate }
}

const BLANK = { name: '', institution: '', account_type: 'Checking', balance: '' }

export function NetWorth({ accounts, snapshots, onAdd, onUpdate, onDelete, onImportCSV, onBack }) {
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [showAdd, setShowAdd] = useState(false)
  const [importMsg, setImportMsg] = useState(null)
  const fileRef = useRef(null)

  const totalAssets = accounts.filter(a => !a.is_liability).reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = accounts.filter(a => a.is_liability).reduce((s, a) => s + a.balance, 0)
  const netWorth = totalAssets - totalLiabilities

  const assetGroups = groupByType(accounts.filter(a => !a.is_liability))
  const liabilityGroups = groupByType(accounts.filter(a => a.is_liability))

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const { accounts: parsed, asOfDate } = parseNWCSV(ev.target.result)
        const msg = accounts.length > 0
          ? `Replace all ${accounts.length} existing accounts with ${parsed.length} accounts from CSV?`
          : `Import ${parsed.length} accounts from CSV?`
        if (!window.confirm(msg)) return
        onImportCSV(parsed, asOfDate, true)
        setImportMsg({ ok: true, text: `Replaced with ${parsed.length} accounts (as of ${asOfDate})` })
        setTimeout(() => setImportMsg(null), 5000)
      } catch (err) {
        setImportMsg({ ok: false, text: err.message })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleAdd() {
    const balance = parseFloat(form.balance)
    if (!form.name.trim() || isNaN(balance)) return
    onAdd({ id: crypto.randomUUID(), name: form.name.trim(), institution: form.institution.trim(), account_type: form.account_type, is_liability: isLiabilityType(form.account_type) ? 1 : 0, balance, last_updated: new Date().toISOString().split('T')[0], sort_order: accounts.length })
    setForm(BLANK)
    setShowAdd(false)
  }

  function startEdit(acct) {
    setEditId(acct.id)
    setForm({ name: acct.name, institution: acct.institution ?? '', account_type: acct.account_type, balance: String(acct.balance) })
    setShowAdd(false)
  }

  function saveEdit() {
    const balance = parseFloat(form.balance)
    if (!form.name.trim() || isNaN(balance)) return
    onUpdate(editId, { name: form.name.trim(), institution: form.institution.trim(), account_type: form.account_type, is_liability: isLiabilityType(form.account_type) ? 1 : 0, balance, last_updated: new Date().toISOString().split('T')[0] })
    setEditId(null)
  }

  const nwPositive = netWorth >= 0
  const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <ChevronLeft size={16} /> Dashboard
      </button>

      {/* Header */}
      <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
        <p className="text-sm text-purple-400 font-medium mb-1">Net Worth</p>
        <p className={`text-4xl font-bold ${nwPositive ? 'text-white' : 'text-red-400'}`}>
          {nwPositive ? '' : '-'}${fmt(Math.abs(netWorth))}
        </p>
        <div className="flex gap-5 mt-3 text-sm">
          <span className="text-gray-400">Assets <span className="text-green-400 font-semibold">${fmt(totalAssets)}</span></span>
          <span className="text-gray-400">Liabilities <span className="text-red-400 font-semibold">−${fmt(totalLiabilities)}</span></span>
        </div>
      </div>

      {snapshots.length > 0 && <HistoryChart snapshots={snapshots} />}

      {importMsg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl border ${importMsg.ok ? 'bg-green-900/40 text-green-300 border-green-500/20' : 'bg-red-900/40 text-red-300 border-red-500/20'}`}>
          {importMsg.text}
        </div>
      )}

      <AccountSection title="Assets" groups={assetGroups} typeOrder={ASSET_TYPES} editId={editId} form={form} setForm={setForm} onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditId(null)} onDelete={onDelete} />

      <AccountSection title="Liabilities" groups={liabilityGroups} typeOrder={LIABILITY_TYPES} editId={editId} form={form} setForm={setForm} onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditId(null)} onDelete={onDelete} />

      {showAdd && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Add Account</p>
          <AccountForm form={form} setForm={setForm} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setForm(BLANK) }} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleAdd} className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">Add</button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => { setShowAdd(s => !s); setEditId(null); if (!showAdd) setForm(BLANK) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus size={16} /> Add Account
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-white/10 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Upload size={16} /> Import CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
      </div>
    </div>
  )
}

function HistoryChart({ snapshots }) {
  const chartRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!chartRef.current) return
    const ro = new ResizeObserver(entries => {
      if (entries[0]?.contentRect.width > 0) setReady(true)
    })
    ro.observe(chartRef.current)
    return () => ro.disconnect()
  }, [])

  const spanDays = snapshots.length > 1
    ? (new Date(snapshots.at(-1).date) - new Date(snapshots[0].date)) / 86400000
    : 0
  const data = snapshots.map(s => {
    const [yyyy, mm, dd] = s.date.split('-')
    const d = new Date(+yyyy, +mm - 1, +dd)
    const label = spanDays > 90
      ? d.toLocaleString('default', { month: 'short', year: '2-digit' })
      : d.toLocaleString('default', { month: 'short', day: 'numeric' })
    return {
      date: label,
      'Net Worth': Math.round(s.net_worth),
      Assets: Math.round(s.total_assets),
      Liabilities: Math.round(s.total_liabilities),
    }
  })

  const fmtY = v => {
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
    return `$${v}`
  }

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
      <p className="text-sm font-medium text-gray-300 mb-3">History</p>
      <div ref={chartRef}>
        {!ready ? null : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={fmtY} width={56} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f3f4f6', fontSize: 12 }}
                formatter={(value, name) => [`$${Math.round(value).toLocaleString()}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Line dataKey="Assets" type="monotone" stroke="#22c55e" strokeWidth={2} dot={snapshots.length < 10} />
              <Line dataKey="Liabilities" type="monotone" stroke="#f87171" strokeWidth={2} dot={snapshots.length < 10} />
              <Line dataKey="Net Worth" type="monotone" stroke="#a78bfa" strokeWidth={2.5} dot={snapshots.length < 10} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {snapshots.length === 1 && (
        <p className="text-xs text-gray-600 mt-2 text-center">Import again next month to see the trend</p>
      )}
    </div>
  )
}

function AccountForm({ form, setForm }) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        placeholder="Account name"
        className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={form.institution}
          onChange={e => setForm(f => ({ ...f, institution: e.target.value }))}
          placeholder="Institution"
          className="bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
        />
        <select
          value={form.account_type}
          onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}
          className="bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
        >
          <optgroup label="Assets">
            {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
          <optgroup label="Liabilities">
            {LIABILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
        </select>
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input
          type="number"
          value={form.balance}
          onChange={e => setForm(f => ({ ...f, balance: e.target.value }))}
          placeholder="0.00"
          min="0"
          step="0.01"
          className="w-full bg-gray-800 border border-white/10 rounded-lg pl-6 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
        />
      </div>
    </div>
  )
}

function AccountSection({ title, groups, typeOrder, editId, form, setForm, onStartEdit, onSaveEdit, onCancelEdit, onDelete }) {
  const isLiab = title === 'Liabilities'
  const orderedTypes = typeOrder.filter(t => groups[t]?.length)
  if (!orderedTypes.length) return null

  const sectionTotal = orderedTypes.flatMap(t => groups[t]).reduce((s, a) => s + a.balance, 0)
  const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
        <p className={`text-sm font-bold ${isLiab ? 'text-red-400' : 'text-green-400'}`}>
          {isLiab ? '−' : ''}${fmt(sectionTotal)}
        </p>
      </div>
      <div className="space-y-2">
        {orderedTypes.map(type => (
          <div key={type} className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <p className="text-xs font-medium text-gray-400">{type}</p>
              <p className="text-xs font-semibold tabular-nums text-gray-400">
                ${fmt(groups[type].reduce((s, a) => s + a.balance, 0))}
              </p>
            </div>
            {groups[type].map((acct, i) =>
              editId === acct.id ? (
                <div key={acct.id} className={`px-4 py-3 space-y-2 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                  <AccountForm form={form} setForm={setForm} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={onCancelEdit} className="p-1 text-gray-500 hover:text-white transition-colors"><X size={14} /></button>
                    <button onClick={onSaveEdit} className="p-1 text-purple-400 hover:text-purple-300 transition-colors"><Check size={14} /></button>
                  </div>
                </div>
              ) : (
                <div key={acct.id} className={`flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors ${i > 0 ? 'border-t border-white/5' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{acct.name}</p>
                    {acct.institution && <p className="text-xs text-gray-500">{acct.institution}</p>}
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className={`text-sm font-semibold tabular-nums ${isLiab ? 'text-red-300' : 'text-green-300'}`}>
                      ${fmt(acct.balance)}
                    </span>
                    <button onClick={() => onStartEdit(acct)} className="p-1 text-gray-500 hover:text-white transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => { if (window.confirm(`Delete "${acct.name}"?`)) onDelete(acct.id) }} className="p-1 text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
