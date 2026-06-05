import { useState, useCallback, useEffect, useRef, useMemo, Component } from 'react'
import { Menu, TrendingUp, TrendingDown, Plus, FileUp, List, BarChart2, ChevronLeft, ChevronRight, Wallet } from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Reports } from './components/Reports'
import { Budget } from './components/Budget'
import { useAuth } from './hooks/useAuth'
import { useDatabase } from './hooks/useDatabase'
import { LoginScreen } from './components/LoginScreen'
import { ExpenseForm } from './components/ExpenseForm'
import { ExpenseList } from './components/ExpenseList'
import { CSVImport } from './components/CSVImport'
import { SettingsSidebar } from './components/SettingsSidebar'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div className="bg-red-900/40 border border-red-500/30 rounded-xl p-5 text-sm text-red-300 space-y-2">
        <p className="font-semibold text-red-200">Something went wrong loading this view.</p>
        <p className="font-mono text-xs break-all">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="text-xs text-red-400 underline">Try again</button>
      </div>
    )
    return this.props.children
  }
}

export default function App() {
  const { user, accessToken, loading, gisReady, login, logout, clearAuth } = useAuth()
  const { db, loading: dbLoading, error: dbError, query, run, save } = useDatabase(accessToken, clearAuth)

  // null = dashboard, 'list' = full list, 'add' = add form, 'csv' = import, expense object = edit form
  const [formState, setFormState] = useState(null)
  const [returnTo, setReturnTo] = useState(null)
  const [listFilters, setListFilters] = useState({})
  const [reportFilters, setReportFilters] = useState({})
  const [saving, setSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dashboardYear, setDashboardYear] = useState(() => new Date().getFullYear())
  const [dashboardMonth, setDashboardMonth] = useState(() => new Date().getMonth())
  const listScrollY = useRef(0)

  useEffect(() => {
    if (formState === 'list') window.scrollTo(0, listScrollY.current)
  }, [formState])

  const categories = db ? query('SELECT name FROM categories ORDER BY name').map(r => r.name) : []
  const paymentMethods = db ? query('SELECT name FROM payment_methods ORDER BY name').map(r => r.name) : []
  const exchangeRates = db
    ? Object.fromEntries(query('SELECT currency, rate FROM exchange_rates').map(r => [r.currency, r.rate]))
    : {}
  const transactionTypes = db ? query('SELECT name, is_income, is_transfer FROM transaction_types ORDER BY is_income, name') : []
  const expenses = db ? query('SELECT * FROM expenses ORDER BY date DESC, created_at DESC') : []
  const budgets = db ? query('SELECT category, year, monthly_limit FROM budgets ORDER BY category') : []

  const handleSave = useCallback(async (expense) => {
    setSaving(true)
    try {
      if (formState === 'add') {
        run(
          `INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            expense.id, expense.date, expense.merchant, expense.description,
            expense.amount, expense.currency, expense.amount_usd,
            expense.category, expense.payment_method, expense.receipt_filename,
            expense.source, expense.notes, expense.created_at, expense.updated_at,
            expense.type ?? 'Expense', expense.is_recurring ?? 0,
          ]
        )
      } else {
        run(
          `UPDATE expenses SET date=?, merchant=?, description=?, amount=?, currency=?,
           amount_usd=?, type=?, category=?, payment_method=?, notes=?, updated_at=?, is_recurring=? WHERE id=?`,
          [
            expense.date, expense.merchant, expense.description,
            expense.amount, expense.currency, expense.amount_usd,
            expense.type, expense.category, expense.payment_method, expense.notes,
            expense.updated_at, expense.is_recurring ?? 0, expense.id,
          ]
        )
      }
      await save()
      setFormState(returnTo)
      setReturnTo(null)
    } finally {
      setSaving(false)
    }
  }, [formState, returnTo, run, save])

  const handleDelete = useCallback(async (id) => {
    run('DELETE FROM expenses WHERE id=?', [id])
    await save()
  }, [run, save])

  const handleBulkDelete = useCallback(async (ids) => {
    ids.forEach(id => run('DELETE FROM expenses WHERE id=?', [id]))
    await save()
  }, [run, save])

  const handleBulkEdit = useCallback(async (ids, { type, category }) => {
    const placeholders = ids.map(() => '?').join(',')
    if (type) run(`UPDATE expenses SET type=? WHERE id IN (${placeholders})`, [type, ...ids])
    if (category) run(`UPDATE expenses SET category=? WHERE id IN (${placeholders})`, [category, ...ids])
    await save()
  }, [run, save])

  // Category callbacks
  const handleAddCategory = useCallback(async (name) => {
    run('INSERT OR IGNORE INTO categories VALUES (?)', [name])
    await save()
  }, [run, save])

  const handleRenameCategory = useCallback(async (oldName, newName) => {
    run('UPDATE categories SET name=? WHERE name=?', [newName, oldName])
    run('UPDATE expenses SET category=? WHERE category=?', [newName, oldName])
    run('UPDATE budgets SET category=? WHERE category=?', [newName, oldName])
    await save()
  }, [run, save])

  const handleDeleteCategory = useCallback(async (name) => {
    run('DELETE FROM categories WHERE name=?', [name])
    run('DELETE FROM budgets WHERE category=?', [name])
    await save()
  }, [run, save])

  const handleSetBudget = useCallback(async (category, year, monthlyLimit) => {
    run('INSERT OR REPLACE INTO budgets VALUES (?, ?, ?)', [category, year, monthlyLimit])
    await save()
  }, [run, save])

  const handleDeleteBudget = useCallback(async (category, year) => {
    if (year != null) {
      run('DELETE FROM budgets WHERE category=? AND year=?', [category, year])
    } else {
      run('DELETE FROM budgets WHERE category=?', [category])
    }
    await save()
  }, [run, save])

  // Payment method callbacks
  const handleAddPaymentMethod = useCallback(async (name) => {
    run('INSERT OR IGNORE INTO payment_methods VALUES (?)', [name])
    await save()
  }, [run, save])

  const handleRenamePaymentMethod = useCallback(async (oldName, newName) => {
    run('UPDATE payment_methods SET name=? WHERE name=?', [newName, oldName])
    run('UPDATE expenses SET payment_method=? WHERE payment_method=?', [newName, oldName])
    await save()
  }, [run, save])

  const handleDeletePaymentMethod = useCallback(async (name) => {
    run('DELETE FROM payment_methods WHERE name=?', [name])
    await save()
  }, [run, save])

  // Exchange rate callbacks
  const handleUpdateExchangeRate = useCallback(async (currency, rate) => {
    run('INSERT OR REPLACE INTO exchange_rates VALUES (?, ?)', [currency, rate])
    await save()
  }, [run, save])

  const handleDeleteExchangeRate = useCallback(async (currency) => {
    run('DELETE FROM exchange_rates WHERE currency=?', [currency])
    await save()
  }, [run, save])

  const handleAddTransactionType = useCallback(async (name, is_income) => {
    run('INSERT OR IGNORE INTO transaction_types VALUES (?, ?)', [name, is_income])
    await save()
  }, [run, save])

  const handleRenameTransactionType = useCallback(async (oldName, newName) => {
    run('UPDATE transaction_types SET name=? WHERE name=?', [newName, oldName])
    run('UPDATE expenses SET type=? WHERE type=?', [newName, oldName])
    await save()
  }, [run, save])

  const handleDeleteTransactionType = useCallback(async (name) => {
    run('DELETE FROM transaction_types WHERE name=?', [name])
    await save()
  }, [run, save])

  const handleToggleTransactionTypeIncome = useCallback(async (name, is_income, is_transfer = 0) => {
    run('UPDATE transaction_types SET is_income=?, is_transfer=? WHERE name=?', [is_income, is_transfer, name])
    await save()
  }, [run, save])

  const handleCSVImport = useCallback(async (rows) => {
    setSaving(true)
    try {
      // Ensure any categories used in this import exist in the categories table
      const seen = new Set()
      for (const e of rows) {
        if (e.category && !seen.has(e.category)) {
          run('INSERT OR IGNORE INTO categories VALUES (?)', [e.category])
          seen.add(e.category)
        }
      }
      for (const e of rows) {
        run(
          `INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [e.id, e.date, e.merchant, e.description, e.amount, e.currency,
           e.amount_usd, e.category, e.payment_method, e.receipt_filename,
           e.source, e.notes, e.created_at, e.updated_at, e.type ?? 'Expense', 0]
        )
      }
      await save()
      // After import, jump to the list filtered to the imported date range
      // so the user can see what was just imported regardless of current month
      if (rows.length > 0) {
        const dates = rows.map(e => e.date).filter(Boolean).sort()
        setListFilters({ dateFrom: dates[0], dateTo: dates[dates.length - 1] })
        setFormState('list')
      } else {
        setFormState(null)
      }
    } finally {
      setSaving(false)
    }
  }, [run, save])

  const categoryProps = {
    onAddCategory: handleAddCategory,
    onRenameCategory: handleRenameCategory,
    onDeleteCategory: handleDeleteCategory,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onLogin={login} gisReady={gisReady} />
  }

  return (
    <div
      className="min-h-screen text-white relative"
      style={{ backgroundImage: `url('${import.meta.env.BASE_URL}panama.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-black/70" />

      <SettingsSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onLogout={() => { logout(); setSidebarOpen(false) }}
        categories={categories}
        paymentMethods={paymentMethods}
        exchangeRates={exchangeRates}
        transactionTypes={transactionTypes}
        onAddCategory={handleAddCategory}
        onRenameCategory={handleRenameCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddPaymentMethod={handleAddPaymentMethod}
        onRenamePaymentMethod={handleRenamePaymentMethod}
        onDeletePaymentMethod={handleDeletePaymentMethod}
        onUpdateExchangeRate={handleUpdateExchangeRate}
        onDeleteExchangeRate={handleDeleteExchangeRate}
        onAddTransactionType={handleAddTransactionType}
        onRenameTransactionType={handleRenameTransactionType}
        onDeleteTransactionType={handleDeleteTransactionType}
        onToggleTransactionTypeIncome={handleToggleTransactionTypeIncome}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-400 hover:text-white transition-colors"
              title="Settings"
            >
              <Menu size={22} />
            </button>
            <button
              onClick={() => setFormState(null)}
              className="text-2xl font-bold hover:text-gray-300 transition-colors"
            >
              Expense Tracker
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Avatar user={user} size={8} />
            <span className="text-sm text-gray-300 hidden sm:block">{user.name}</span>
          </div>
        </div>

        {dbLoading && <p className="text-gray-400 text-sm">Connecting to Google Drive...</p>}
        {dbError && <p className="text-red-400 text-sm">Database error: {dbError}</p>}
        {saving && <p className="text-blue-400 text-sm mb-2">Saving to Drive...</p>}

        {db && (
          <>
            {formState === 'csv' ? (
              <CSVImport
                categories={categories}
                paymentMethods={paymentMethods}
                exchangeRates={exchangeRates}
                transactionTypes={transactionTypes}
                existingExpenses={expenses}
                accessToken={accessToken}
                onImport={handleCSVImport}
                onClose={() => setFormState(null)}
                {...categoryProps}
              />
            ) : formState === 'add' || (formState && typeof formState === 'object') ? (
              <ExpenseForm
                categories={categories}
                paymentMethods={paymentMethods}
                exchangeRates={exchangeRates}
                transactionTypes={transactionTypes}
                initialValues={formState === 'add' ? null : formState}
                onSave={handleSave}
                onCancel={() => { setFormState(returnTo); setReturnTo(null) }}
                {...categoryProps}
              />
            ) : formState === 'budget' ? (
              <Budget
                categories={categories}
                budgets={budgets}
                onSetBudget={handleSetBudget}
                onDeleteBudget={handleDeleteBudget}
                onAddCategory={handleAddCategory}
                onBack={() => setFormState(null)}
              />
            ) : formState === 'reports' ? (
              <ErrorBoundary key={reportFilters.dateFrom}>
                <Reports
                  expenses={expenses}
                  transactionTypes={transactionTypes}
                  categories={categories}
                  initialFrom={reportFilters.dateFrom}
                  initialTo={reportFilters.dateTo}
                  onBack={() => { setReportFilters({}); setFormState(null) }}
                />
              </ErrorBoundary>
            ) : formState === 'list' ? (
              <ExpenseList
                expenses={expenses}
                categories={categories}
                transactionTypes={transactionTypes}
                initialFrom={listFilters.dateFrom}
                initialTo={listFilters.dateTo}
                initialFilterType={listFilters.filterType}
                onAdd={() => { setReturnTo('list'); setFormState('add') }}
                onEdit={(expense) => { listScrollY.current = window.scrollY; setReturnTo('list'); setFormState(expense) }}
                onDelete={handleDelete}
                onBulkDelete={handleBulkDelete}
                onBulkEdit={handleBulkEdit}
                onImportCSV={() => setFormState('csv')}
                onBack={() => { setListFilters({}); setFormState(null) }}
              />
            ) : (
              <Dashboard
                expenses={expenses}
                transactionTypes={transactionTypes}
                budgets={budgets}
                selectedYear={dashboardYear}
                selectedMonth={dashboardMonth}
                setSelectedYear={setDashboardYear}
                setSelectedMonth={setDashboardMonth}
                onViewList={(filters) => { setListFilters(filters || {}); setFormState('list') }}
                onAdd={() => setFormState('add')}
                onImportCSV={() => setFormState('csv')}
                onViewReports={(filters) => { setReportFilters(filters || {}); setFormState('reports') }}
                onViewBudget={() => setFormState('budget')}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CashFlowChart({ expenses, incomeTypeNames, transferTypeNames }) {
  const chartRef = useRef(null)
  const [chartReady, setChartReady] = useState(false)

  useEffect(() => {
    if (!chartRef.current) return
    const ro = new ResizeObserver(entries => {
      if (entries[0]?.contentRect.width > 0) setChartReady(true)
    })
    ro.observe(chartRef.current)
    return () => ro.disconnect()
  }, [])

  const data = useMemo(() => {
    const now = new Date()
    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({ key, label: d.toLocaleString('default', { month: 'short', year: '2-digit' }) })
    }
    return months.map(({ key, label }) => {
      const inMonth = expenses.filter(e => e.date?.startsWith(key))
      const income = inMonth.filter(e => incomeTypeNames.has(e.type)).reduce((s, e) => s + (e.amount_usd ?? 0), 0)
      const expenses_ = inMonth.filter(e => !incomeTypeNames.has(e.type) && !transferTypeNames.has(e.type)).reduce((s, e) => s + (e.amount_usd ?? 0), 0)
      const net = income - expenses_
      return { month: label, Income: parseFloat(income.toFixed(2)), Expenses: parseFloat(expenses_.toFixed(2)), Net: parseFloat(net.toFixed(2)) }
    })
  }, [expenses, incomeTypeNames, transferTypeNames])

  const hasData = data.some(d => d.Income > 0 || d.Expenses > 0)

  return (
    <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-4">
      <p className="text-sm font-medium text-gray-300 mb-3">Cash Flow — Last 12 Months</p>
      <div ref={chartRef}>
        {!hasData ? (
          <p className="text-center text-gray-500 text-sm py-8">No transaction data yet.</p>
        ) : !chartReady ? null : (
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f3f4f6', fontSize: 12 }}
                formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="Income" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Expenses" fill="#f97316" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Line dataKey="Net" type="monotone" stroke="#60a5fa" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function Dashboard({ expenses, transactionTypes, budgets, selectedYear, selectedMonth, setSelectedYear, setSelectedMonth, onViewList, onAdd, onImportCSV, onViewReports, onViewBudget }) {
  const incomeTypeNames = new Set((transactionTypes ?? []).filter(t => t.is_income && !t.is_transfer).map(t => t.name))
  const transferTypeNames = new Set((transactionTypes ?? []).filter(t => t.is_transfer).map(t => t.name))

  const now = new Date()

  function prevMonth() {
    if (selectedMonth === 0) { setSelectedYear(y => y - 1); setSelectedMonth(11) }
    else setSelectedMonth(m => m - 1)
  }
  function nextMonth() {
    if (selectedMonth === 11) { setSelectedYear(y => y + 1); setSelectedMonth(0) }
    else setSelectedMonth(m => m + 1)
  }

  const m = String(selectedMonth + 1).padStart(2, '0')
  const y = selectedYear
  const lastDay = new Date(y, selectedMonth + 1, 0).getDate()
  const monthStart = `${y}-${m}-01`
  const monthEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
  const monthLabel = new Date(y, selectedMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const isCurrentMonth = y === now.getFullYear() && selectedMonth === now.getMonth()

  const monthExpenses = expenses.filter(e => e.date?.startsWith(`${y}-${m}`))

  const totalIncome = monthExpenses
    .filter(e => incomeTypeNames.has(e.type))
    .reduce((s, e) => s + (e.amount_usd ?? 0), 0)

  const totalExpenses = monthExpenses
    .filter(e => !incomeTypeNames.has(e.type) && !transferTypeNames.has(e.type))
    .reduce((s, e) => s + (e.amount_usd ?? 0), 0)

  const net = totalIncome - totalExpenses

  const monthFilters = { dateFrom: monthStart, dateTo: monthEnd }

  return (
    <div className="space-y-4">
      {/* Month navigator */}
      <div className="flex items-center justify-between px-1">
        <button onClick={prevMonth} className="p-1.5 text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={22} />
        </button>
        <div className="text-center">
          <p className="text-xl font-semibold text-white">{monthLabel}</p>
          {!isCurrentMonth && (
            <button onClick={() => { setSelectedYear(now.getFullYear()); setSelectedMonth(now.getMonth()) }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors mt-0.5">
              Back to current month
            </button>
          )}
        </div>
        <button onClick={nextMonth} className="p-1.5 text-gray-400 hover:text-white transition-colors">
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onViewList({ ...monthFilters, filterType: '__income__' })}
          className="bg-green-900/30 hover:bg-green-900/50 border border-green-500/30 rounded-2xl p-5 text-left transition-colors"
        >
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <TrendingUp size={18} />
            <span className="text-sm font-medium">Income</span>
          </div>
          <p className="text-2xl font-bold text-white">${totalIncome.toFixed(2)}</p>
        </button>

        <button
          onClick={() => onViewList({ ...monthFilters, filterType: '__expense__' })}
          className="bg-gray-900/60 hover:bg-gray-900/80 border border-white/10 rounded-2xl p-5 text-left transition-colors"
        >
          <div className="flex items-center gap-2 text-orange-300 mb-2">
            <TrendingDown size={18} />
            <span className="text-sm font-medium">Expenses</span>
          </div>
          <p className="text-2xl font-bold text-white">${totalExpenses.toFixed(2)}</p>
        </button>
      </div>

      {/* Cash flow chart */}
      <CashFlowChart expenses={expenses} incomeTypeNames={incomeTypeNames} transferTypeNames={transferTypeNames} />

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={onAdd}
            className="flex flex-col items-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl py-4 transition-colors"
          >
            <Plus size={20} />
            <span className="text-xs font-medium">Add</span>
          </button>
          <button
            onClick={() => onViewList(monthFilters)}
            className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl py-4 transition-colors"
          >
            <List size={20} />
            <span className="text-xs font-medium">Transactions</span>
          </button>
          <button
            onClick={() => onViewReports(monthFilters)}
            className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl py-4 transition-colors"
          >
            <BarChart2 size={20} />
            <span className="text-xs font-medium">Reports</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onViewBudget}
            className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl py-4 transition-colors"
          >
            <Wallet size={20} />
            <span className="text-xs font-medium">Budget</span>
          </button>
          <button
            onClick={onImportCSV}
            className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl py-4 transition-colors"
          >
            <FileUp size={20} />
            <span className="text-xs font-medium">Import</span>
          </button>
        </div>
      </div>

      {/* Budget progress — compact list at bottom */}
      {budgets?.length > 0 && (() => {
        const yearBudgets = budgets.filter(b => b.year === selectedYear)
        if (yearBudgets.length === 0) return null
        const budgetRows = yearBudgets.map(b => {
          const spent = monthExpenses
            .filter(e => e.category === b.category && !incomeTypeNames.has(e.type) && !transferTypeNames.has(e.type))
            .reduce((s, e) => s + (e.amount_usd ?? 0), 0)
          const pct = b.monthly_limit > 0 ? spent / b.monthly_limit : 0
          return { ...b, spent, pct }
        }).sort((a, b) => b.pct - a.pct)
        return (
          <div className="bg-gray-900/60 border border-white/10 rounded-xl overflow-hidden">
            {budgetRows.map(({ category, monthly_limit, spent, pct }, i) => (
              <div key={category} className={`flex items-center gap-3 px-4 py-2 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <span className="text-xs text-gray-400 flex-1 truncate">{category}</span>
                <div className="w-20 bg-gray-800 rounded-full h-1">
                  <div
                    className={`h-1 rounded-full transition-all ${pct >= 1 ? 'bg-red-500' : pct >= 0.75 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(pct * 100, 100)}%` }}
                  />
                </div>
                <span className={`text-xs w-20 text-right tabular-nums ${pct >= 1 ? 'text-red-400' : pct >= 0.75 ? 'text-yellow-400' : 'text-gray-500'}`}>
                  ${spent.toFixed(0)} / ${monthly_limit.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

function Avatar({ user, size = 8 }) {
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
        alt={user.name}
        className={`w-${size} h-${size} rounded-full object-cover`}
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <div className={`w-${size} h-${size} rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
      {initials}
    </div>
  )
}
