import { useState } from 'react'
import { X, ScanLine, RefreshCw, Scissors } from 'lucide-react'
import { ReceiptScanner } from './ReceiptScanner'
import { CategorySelect } from './CategorySelect'
import { toTitleCase } from '../lib/utils'

function parseSplits(raw) {
  try { return JSON.parse(raw) } catch { return null }
}

const CURRENCIES = ['USD', 'PAB', 'EUR']

function SplitSection({ splits, setSplits, categories, onAddCategory, totalUsd, defaultCategory }) {
  const allocated = splits.reduce((s, sp) => s + (parseFloat(sp.amount_usd) || 0), 0)
  const remaining = totalUsd - allocated
  const overBudget = remaining < -0.005

  function updateSplit(i, field, value) {
    setSplits(prev => prev.map((sp, idx) => idx === i ? { ...sp, [field]: value } : sp))
  }

  function addSplit() {
    setSplits(prev => [...prev, { category: defaultCategory, amount_usd: '', description: '' }])
  }

  function removeSplit(i) {
    setSplits(prev => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2 bg-yellow-900/10 border border-yellow-500/20 rounded-xl p-3">
      <p className="text-xs text-yellow-400/80 font-medium mb-2">Split transaction</p>
      {splits.map((sp, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex gap-2 items-center">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <CategorySelect
                value={sp.category}
                onChange={v => updateSplit(i, 'category', v)}
                categories={categories}
                onAdd={onAddCategory}
                className="w-full py-1.5 px-3 text-sm rounded-lg"
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={sp.amount_usd}
                  onChange={e => updateSplit(i, 'amount_usd', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full bg-gray-800 border border-white/10 rounded-lg pl-6 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>
            {splits.length > 2 && (
              <button
                type="button"
                onClick={() => removeSplit(i)}
                className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <input
            type="text"
            value={sp.description ?? ''}
            onChange={e => updateSplit(i, 'description', e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addSplit}
        className="text-xs text-yellow-500/70 hover:text-yellow-400 transition-colors mt-1"
      >
        + Add another split
      </button>
      <div className={`text-xs flex gap-3 ${overBudget ? 'text-red-400' : 'text-gray-500'}`}>
        <span>Total: <span className="text-white">${totalUsd.toFixed(2)}</span></span>
        <span>Allocated: <span className={overBudget ? 'text-red-400 font-semibold' : 'text-white'}>${allocated.toFixed(2)}</span></span>
        {!overBudget && <span>Remaining: <span className="text-white">${remaining.toFixed(2)}</span></span>}
        {overBudget && <span className="font-semibold">Over by ${Math.abs(remaining).toFixed(2)}</span>}
      </div>
    </div>
  )
}

export function ExpenseForm({ categories, paymentMethods, exchangeRates, transactionTypes, onSave, onCancel, initialValues, onAddCategory, onRenameCategory, onDeleteCategory }) {
  const today = new Date().toISOString().slice(0, 10)
  const [showScanner, setShowScanner] = useState(false)

  const existingSplits = initialValues?.splits ? parseSplits(initialValues.splits) : null
  const [splitEnabled, setSplitEnabled] = useState(!!existingSplits)
  const defaultCategory = initialValues?.category ?? categories[0] ?? ''
  const [splits, setSplits] = useState(existingSplits ?? [
    { category: defaultCategory, amount_usd: '', description: '' },
    { category: defaultCategory, amount_usd: '', description: '' },
  ])

  const defaultType = transactionTypes?.[0]?.name ?? 'expense'

  const [form, setForm] = useState({
    date: initialValues?.date ?? today,
    merchant: initialValues?.merchant ?? '',
    description: initialValues?.description ?? '',
    amount: initialValues?.amount ?? '',
    currency: initialValues?.currency ?? 'USD',
    type: initialValues?.type ?? defaultType,
    category: initialValues?.category ?? (categories[0] ?? ''),
    payment_method: initialValues?.payment_method ?? (paymentMethods[0] ?? ''),
    notes: initialValues?.notes ?? '',
    is_recurring: initialValues?.is_recurring ? 1 : 0,
  })

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleExtracted({ merchant, date, amount }) {
    setForm(f => ({
      ...f,
      ...(merchant ? { merchant } : {}),
      ...(date ? { date } : {}),
      ...(amount != null ? { amount: String(amount) } : {}),
    }))
    setShowScanner(false)
  }

  function toUsd(amount, currency) {
    const rate = exchangeRates[currency] ?? 1
    return parseFloat((parseFloat(amount) * rate).toFixed(2))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || isNaN(parseFloat(form.amount))) return

    const amountUsdVal = toUsd(form.amount, form.currency)
    let splitsValue = null

    if (splitEnabled) {
      const parsed = splits.map(s => ({ category: s.category, amount_usd: parseFloat(s.amount_usd) || 0, description: s.description?.trim() || null }))
      const total = parsed.reduce((s, sp) => s + sp.amount_usd, 0)
      if (total > amountUsdVal + 0.005) return // guard: don't save if over total
      splitsValue = JSON.stringify(parsed)
    }

    const now = new Date().toISOString()
    onSave({
      id: initialValues?.id ?? crypto.randomUUID(),
      date: form.date,
      merchant: form.merchant.trim() || null,
      description: form.description.trim() || null,
      amount: parseFloat(form.amount),
      currency: form.currency,
      amount_usd: amountUsdVal,
      type: form.type,
      category: splitEnabled ? null : (form.category || null),
      payment_method: form.payment_method || null,
      receipt_filename: initialValues?.receipt_filename ?? null,
      source: initialValues?.source ?? 'manual',
      notes: form.notes.trim() || null,
      is_recurring: form.is_recurring,
      splits: splitsValue,
      created_at: initialValues?.created_at ?? now,
      updated_at: now,
    })
  }

  const amountUsd = form.amount && !isNaN(parseFloat(form.amount))
    ? toUsd(form.amount, form.currency)
    : null

  const selectedType = transactionTypes?.find(t => t.name === form.type)
  const isIncome = !!selectedType?.is_income

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{initialValues ? 'Edit Transaction' : 'Add Transaction'}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowScanner(s => !s)}
            className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ScanLine size={16} />
            Scan receipt
          </button>
          <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors ml-1">
            <X size={20} />
          </button>
        </div>
      </div>

      {showScanner && (
        <div className="mb-4">
          <ReceiptScanner onExtracted={handleExtracted} onClose={() => setShowScanner(false)} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type selector + recurring */}
        <div className="flex gap-2 flex-wrap">
          {transactionTypes?.map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => set('type', t.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                form.type === t.name
                  ? t.is_transfer
                    ? 'bg-gray-600/30 border-gray-500 text-gray-300'
                    : t.is_income
                      ? 'bg-green-600/30 border-green-500 text-green-300'
                      : 'bg-blue-600/30 border-blue-500 text-blue-300'
                  : 'bg-gray-800 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              {t.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => set('is_recurring', form.is_recurring ? 0 : 1)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              form.is_recurring
                ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                : 'bg-gray-800 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            <RefreshCw size={13} />
            Recurring
          </button>
          <button
            type="button"
            onClick={() => setSplitEnabled(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              splitEnabled
                ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300'
                : 'bg-gray-800 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            <Scissors size={13} />
            Split
          </button>
        </div>

        {/* Date + Merchant */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              required
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{isIncome ? 'Source' : 'Merchant'}</label>
            <input
              type="text"
              value={form.merchant}
              onChange={e => set('merchant', e.target.value)}
              placeholder={isIncome ? 'e.g. Employer, Client' : 'e.g. SuperFarmacias'}
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Amount + Currency */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Amount</label>
            <input
              type="number"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              required
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Currency</label>
            <select
              value={form.currency}
              onChange={e => set('currency', e.target.value)}
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {amountUsd !== null && form.currency !== 'USD' && (
          <p className="text-xs text-gray-400 -mt-2">≈ ${amountUsd.toFixed(2)} USD</p>
        )}

        {/* Category + Payment Method */}
        {splitEnabled ? (
          <SplitSection
            splits={splits}
            setSplits={setSplits}
            categories={categories}
            onAddCategory={onAddCategory}
            totalUsd={amountUsd ?? 0}
            defaultCategory={defaultCategory}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <CategorySelect
                value={form.category}
                onChange={v => set('category', v)}
                categories={categories}
                onAdd={onAddCategory}
                className="w-full py-2 px-3 text-sm rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payment Method</label>
              <select
                value={form.payment_method}
                onChange={e => set('payment_method', e.target.value)}
                className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {paymentMethods.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        {splitEnabled && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Payment Method</label>
            <select
              value={form.payment_method}
              onChange={e => set('payment_method', e.target.value)}
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {paymentMethods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Optional description"
            className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Optional notes"
            rows={2}
            className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              isIncome ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {initialValues ? 'Save Changes' : isIncome ? 'Add Income' : 'Add Expense'}
          </button>
        </div>
      </form>
    </div>
  )
}
