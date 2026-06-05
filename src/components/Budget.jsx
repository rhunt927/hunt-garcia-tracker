import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Check, X, Pencil } from 'lucide-react'

export function Budget({ categories, budgets, expenses, transactionTypes, onSetBudget, onDeleteBudget, onAddCategory, onEditExpense, onBack, initialYear, initialMonth }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const [year, setYear] = useState(initialYear ?? currentYear)
  const [month, setMonth] = useState(initialMonth ?? currentMonth)
  const [view, setView] = useState('list') // 'list' | 'detail' | 'edit'
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [budgetYear, setBudgetYear] = useState(currentYear)
  const [budgetAmount, setBudgetAmount] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const newCatRef = useRef(null)

  useEffect(() => {
    if (addingCategory) newCatRef.current?.focus()
  }, [addingCategory])

  const incomeTypeNames = new Set((transactionTypes ?? []).filter(t => t.is_income && !t.is_transfer).map(t => t.name))
  const transferTypeNames = new Set((transactionTypes ?? []).filter(t => t.is_transfer).map(t => t.name))

  const budgetsByCategory = {}
  ;(budgets ?? []).forEach(b => {
    if (!budgetsByCategory[b.category]) budgetsByCategory[b.category] = []
    budgetsByCategory[b.category].push(b)
  })

  const mStr = String(month + 1).padStart(2, '0')
  const monthLabel = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const isCurrentMonth = year === currentYear && month === currentMonth

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const monthExpenses = (expenses ?? [])
    .filter(e => e.date?.startsWith(`${year}-${mStr}`) && !incomeTypeNames.has(e.type) && !transferTypeNames.has(e.type))

  function getSpent(category) {
    return monthExpenses.filter(e => e.category === category).reduce((s, e) => s + (e.amount_usd ?? 0), 0)
  }

  function getBudget(category) {
    return (budgetsByCategory[category] ?? []).find(b => b.year === year) ?? null
  }

  function openDetail(category) {
    setSelectedCategory(category)
    setView('detail')
  }

  function openEdit(category) {
    setSelectedCategory(category)
    setBudgetYear(year)
    const existing = getBudget(category)
    setBudgetAmount(existing ? String(existing.monthly_limit) : '')
    setView('edit')
  }

  function handleBudgetYearChange(yr) {
    setBudgetYear(yr)
    const existing = (budgetsByCategory[selectedCategory] ?? []).find(b => b.year === yr)
    setBudgetAmount(existing ? String(existing.monthly_limit) : '')
  }

  function saveBudget() {
    const amount = parseFloat(budgetAmount)
    if (!isNaN(amount) && amount > 0) onSetBudget(selectedCategory, budgetYear, amount)
    setView('detail')
  }

  function confirmNewCategory() {
    const name = newCategoryName.trim()
    setAddingCategory(false)
    setNewCategoryName('')
    if (!name) return
    onAddCategory?.(name)
    openDetail(name)
  }

  // ── LIST VIEW ─────────────────────────────────────────────────
  if (view === 'list') {
    const yearBudgets = (budgets ?? []).filter(b => b.year === year)
    const budgetedRows = yearBudgets.map(b => {
      const spent = getSpent(b.category)
      const pct = b.monthly_limit > 0 ? spent / b.monthly_limit : 0
      return { category: b.category, monthly_limit: b.monthly_limit, spent, pct }
    }).sort((a, b) => b.pct - a.pct)

    const budgetedNames = new Set(yearBudgets.map(b => b.category))

    // Unbudgeted categories that have spending this month — call these out prominently
    const unbudgetedWithSpending = categories
      .filter(c => !budgetedNames.has(c))
      .map(c => ({ category: c, spent: getSpent(c) }))
      .filter(c => c.spent > 0)
      .sort((a, b) => b.spent - a.spent)

    const spendingNames = new Set(unbudgetedWithSpending.map(c => c.category))
    const unbudgeted = categories.filter(c => !budgetedNames.has(c) && !spendingNames.has(c))

    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={16} /> Dashboard
        </button>

        <div className="flex items-center justify-between px-1">
          <button onClick={prevMonth} className="p-1.5 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={22} />
          </button>
          <div className="text-center">
            <p className="text-xl font-semibold text-white">{monthLabel}</p>
            {!isCurrentMonth && (
              <button onClick={() => { setYear(currentYear); setMonth(currentMonth) }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors mt-0.5">
                Back to current month
              </button>
            )}
          </div>
          <button onClick={nextMonth} className="p-1.5 text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={22} />
          </button>
        </div>

        {budgetedRows.length === 0 && unbudgeted.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No categories yet. Add one below.</p>
        )}

        {(budgetedRows.length > 0 || unbudgetedWithSpending.length > 0) && (
          <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            {budgetedRows.map(({ category, monthly_limit, spent, pct }, i) => (
              <button
                key={category}
                onClick={() => openDetail(category)}
                className={`w-full px-4 py-3 hover:bg-white/5 transition-colors text-left ${i > 0 ? 'border-t border-white/5' : ''}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-white">{category}</span>
                  <span className={`text-xs font-medium tabular-nums ${pct >= 1 ? 'text-red-400' : pct >= 0.75 ? 'text-yellow-400' : 'text-gray-400'}`}>
                    ${spent.toFixed(0)} <span className="text-gray-600">/ ${monthly_limit.toFixed(0)}</span>
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1">
                  <div
                    className={`h-1 rounded-full transition-all ${pct >= 1 ? 'bg-red-500' : pct >= 0.75 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(pct * 100, 100)}%` }}
                  />
                </div>
              </button>
            ))}
            {unbudgetedWithSpending.map(({ category, spent }, i) => (
              <button
                key={category}
                onClick={() => openDetail(category)}
                className={`w-full px-4 py-3 hover:bg-white/5 transition-colors text-left border-t border-white/5`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{category}</span>
                  <div className="text-right">
                    <span className="text-xs font-medium tabular-nums text-orange-400">${spent.toFixed(0)}</span>
                    <span className="text-xs text-gray-600 ml-1">/ no budget</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {unbudgeted.length > 0 && (
          <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            <p className="px-4 pt-3 pb-1 text-xs text-gray-600 uppercase tracking-wide">No budget set</p>
            {unbudgeted.map((category, i) => (
              <button
                key={category}
                onClick={() => openDetail(category)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors border-t border-white/5"
              >
                <span className="text-sm text-gray-500">{category}</span>
                <span className="text-xs text-gray-700">Set budget →</span>
              </button>
            ))}
          </div>
        )}

        {addingCategory ? (
          <div className="flex gap-2 items-center px-1">
            <input
              ref={newCatRef}
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmNewCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName('') } }}
              placeholder="Category name"
              className="flex-1 bg-gray-800 border border-blue-500 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
            />
            <button onClick={confirmNewCategory} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
            <button onClick={() => { setAddingCategory(false); setNewCategoryName('') }} className="text-gray-500 hover:text-white"><X size={16} /></button>
          </div>
        ) : (
          <button onClick={() => setAddingCategory(true)} className="text-sm text-gray-600 hover:text-blue-400 transition-colors px-1">
            + New Category
          </button>
        )}
      </div>
    )
  }

  // ── DETAIL VIEW ───────────────────────────────────────────────
  if (view === 'detail') {
    const budget = getBudget(selectedCategory)
    const spent = getSpent(selectedCategory)
    const limit = budget?.monthly_limit ?? 0
    const pct = limit > 0 ? spent / limit : 0
    const categoryTxns = monthExpenses
      .filter(e => e.category === selectedCategory)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    return (
      <div className="space-y-4">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={16} /> All Categories
        </button>

        <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedCategory}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{monthLabel}</p>
            </div>
            <button
              onClick={() => openEdit(selectedCategory)}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
            >
              <Pencil size={12} />
              {budget ? 'Edit budget' : 'Set budget'}
            </button>
          </div>

          {budget ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className={`text-3xl font-bold ${pct >= 1 ? 'text-red-400' : 'text-white'}`}>
                    ${spent.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">of ${limit.toFixed(0)}/mo</p>
                </div>
                <p className={`text-lg font-semibold ${pct >= 1 ? 'text-red-400' : pct >= 0.75 ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {(pct * 100).toFixed(0)}%
                </p>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${pct >= 1 ? 'bg-red-500' : pct >= 0.75 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(pct * 100, 100)}%` }}
                />
              </div>
              <p className={`text-xs ${pct >= 1 ? 'text-red-400' : 'text-gray-600'}`}>
                {pct >= 1
                  ? `$${(spent - limit).toFixed(2)} over budget`
                  : `$${(limit - spent).toFixed(2)} remaining`}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">No budget set for {year}. Tap "Set budget" to add one.</p>
          )}
        </div>

        <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
          <p className="px-4 pt-3 pb-1 text-xs text-gray-500 uppercase tracking-wide">
            {monthLabel} — {categoryTxns.length} transaction{categoryTxns.length !== 1 ? 's' : ''}
          </p>
          {categoryTxns.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-600">No transactions this month.</p>
          ) : (
            categoryTxns.map((txn, i) => (
              <button
                key={txn.id}
                onClick={() => onEditExpense?.(txn)}
                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left border-t border-white/5`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{txn.merchant || txn.description || '—'}</p>
                  <p className="text-xs text-gray-500">{txn.date}</p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-sm font-medium text-white tabular-nums">${(txn.amount_usd ?? 0).toFixed(2)}</p>
                  {txn.payment_method && <p className="text-xs text-gray-600">{txn.payment_method}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── EDIT VIEW ─────────────────────────────────────────────────
  const existingBudgets = budgetsByCategory[selectedCategory] ?? []
  const hasExistingForYear = !!existingBudgets.find(b => b.year === budgetYear)

  return (
    <div className="space-y-4">
      <button onClick={() => setView('detail')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <ChevronLeft size={16} /> {selectedCategory}
      </button>

      <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl p-5 space-y-5">
        <h2 className="text-lg font-semibold text-white">{selectedCategory}</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Monthly Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                autoFocus
                type="number"
                value={budgetAmount}
                onChange={e => setBudgetAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveBudget(); if (e.key === 'Escape') setView('detail') }}
                placeholder="0"
                min="0"
                step="10"
                className="w-full bg-gray-800 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Year</label>
            <input
              type="number"
              value={budgetYear}
              onChange={e => handleBudgetYearChange(parseInt(e.target.value) || currentYear)}
              min="2020"
              max="2099"
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {existingBudgets.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-2">Budgets set</p>
            <div className="space-y-1.5">
              {existingBudgets.sort((a, b) => a.year - b.year).map(b => (
                <div key={b.year} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{b.year}</span>
                  <span className={`text-sm font-medium ${b.year === budgetYear ? 'text-blue-400' : 'text-gray-400'}`}>
                    ${b.monthly_limit}/mo
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={saveBudget} className="flex-1 bg-blue-600 hover:bg-blue-700 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            Save
          </button>
          <button onClick={() => setView('detail')} className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors">
            Cancel
          </button>
          {hasExistingForYear && (
            <button
              onClick={() => { onDeleteBudget(selectedCategory, budgetYear); setView('detail') }}
              className="px-4 py-2.5 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
