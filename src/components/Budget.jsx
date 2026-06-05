import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Budget({ categories, budgets, onSetBudget, onDeleteBudget, onBack }) {
  const currentYear = new Date().getFullYear()
  const [listYear, setListYear] = useState(currentYear)
  const [editing, setEditing] = useState(null) // null = list, string = category being edited
  const [budgetYear, setBudgetYear] = useState(currentYear)
  const [budgetAmount, setBudgetAmount] = useState('')

  const budgetsByCategory = {}
  ;(budgets ?? []).forEach(b => {
    if (!budgetsByCategory[b.category]) budgetsByCategory[b.category] = []
    budgetsByCategory[b.category].push(b)
  })

  function openCategory(category) {
    setBudgetYear(listYear)
    const existing = (budgetsByCategory[category] ?? []).find(b => b.year === listYear)
    setBudgetAmount(existing ? String(existing.monthly_limit) : '')
    setEditing(category)
  }

  function handleYearChange(yr) {
    setBudgetYear(yr)
    const existing = (budgetsByCategory[editing] ?? []).find(b => b.year === yr)
    setBudgetAmount(existing ? String(existing.monthly_limit) : '')
  }

  function save() {
    const amount = parseFloat(budgetAmount)
    if (!isNaN(amount) && amount > 0) onSetBudget(editing, budgetYear, amount)
    setEditing(null)
  }

  const existingBudgetsForCategory = budgetsByCategory[editing] ?? []
  const hasExistingForYear = !!existingBudgetsForCategory.find(b => b.year === budgetYear)

  // ── Category list ──────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={16} /> Dashboard
        </button>

        <div className="flex items-center justify-between px-1">
          <button onClick={() => setListYear(y => y - 1)} className="p-1.5 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={22} />
          </button>
          <div className="text-center">
            <p className="text-xl font-semibold text-white">{listYear} Budgets</p>
            {listYear !== currentYear && (
              <button onClick={() => setListYear(currentYear)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors mt-0.5">
                Back to {currentYear}
              </button>
            )}
          </div>
          <button onClick={() => setListYear(y => y + 1)} className="p-1.5 text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={22} />
          </button>
        </div>

        <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
          {categories.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No categories yet. Add some in Settings.</p>
          )}
          {categories.map((category, i) => {
            const budget = (budgetsByCategory[category] ?? []).find(b => b.year === listYear)
            return (
              <button
                key={category}
                onClick={() => openCategory(category)}
                className={`w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors text-left ${i > 0 ? 'border-t border-white/5' : ''}`}
              >
                <span className="text-sm text-white">{category}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {budget ? (
                    <span className="text-sm text-blue-400">${budget.monthly_limit}/mo</span>
                  ) : (
                    <span className="text-sm text-gray-600">No budget</span>
                  )}
                  <ChevronRight size={14} className="text-gray-600" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Budget form for a specific category ───────────────────────
  return (
    <div className="space-y-4">
      <button onClick={() => setEditing(null)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <ChevronLeft size={16} /> All Categories
      </button>

      <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl p-5 space-y-5">
        <h2 className="text-lg font-semibold text-white">{editing}</h2>

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
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(null) }}
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
              onChange={e => handleYearChange(parseInt(e.target.value) || currentYear)}
              min="2020"
              max="2099"
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {existingBudgetsForCategory.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-2">Budgets set</p>
            <div className="space-y-1.5">
              {existingBudgetsForCategory.sort((a, b) => a.year - b.year).map(b => (
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
          <button
            onClick={save}
            className="flex-1 bg-blue-600 hover:bg-blue-700 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(null)}
            className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          {hasExistingForYear && (
            <button
              onClick={() => { onDeleteBudget(editing, budgetYear); setEditing(null) }}
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
