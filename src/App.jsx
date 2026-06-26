import { useState, useCallback, useEffect, useRef, useMemo, Component } from 'react'
import { Menu, TrendingUp, TrendingDown, Plus, FileUp, List, BarChart2, ChevronLeft, ChevronRight, Wallet, Landmark } from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Reports } from './components/Reports'
import { Budget } from './components/Budget'
import { Cash } from './components/Cash'
import { NetWorth } from './components/NetWorth'
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
  const cashEntries = db ? (() => { try { return query('SELECT * FROM cash_entries ORDER BY created_at ASC') } catch { return [] } })() : []
  const nwAccounts = db ? (() => { try { return query('SELECT * FROM net_worth_accounts ORDER BY sort_order, id') } catch { return [] } })() : []
  const nwSnapshots = db ? (() => { try { return query('SELECT * FROM net_worth_snapshots ORDER BY date ASC') } catch { return [] } })() : []
  const nwBankAccounts = nwAccounts.filter(a => !a.is_liability && (a.account_type === 'Checking' || a.account_type === 'Savings'))

  const handleSave = useCallback(async (expense) => {
    setSaving(true)
    try {
      if (formState === 'add') {
        run(
          `INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            expense.id, expense.date, expense.merchant, expense.description,
            expense.amount, expense.currency, expense.amount_usd,
            expense.category, expense.payment_method, expense.receipt_filename,
            expense.source, expense.notes, expense.created_at, expense.updated_at,
            expense.type ?? 'Expense', expense.is_recurring ?? 0, expense.splits ?? null,
          ]
        )
      } else {
        run(
          `UPDATE expenses SET date=?, merchant=?, description=?, amount=?, currency=?,
           amount_usd=?, type=?, category=?, payment_method=?, notes=?, updated_at=?, is_recurring=?, splits=? WHERE id=?`,
          [
            expense.date, expense.merchant, expense.description,
            expense.amount, expense.currency, expense.amount_usd,
            expense.type, expense.category, expense.payment_method, expense.notes,
            expense.updated_at, expense.is_recurring ?? 0, expense.splits ?? null, expense.id,
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

  // Cash entry callbacks
  const handleAddCashEntry = useCallback(async ({ description, amount }) => {
    const now = new Date().toISOString()
    run('INSERT INTO cash_entries VALUES (?,?,?,?,?)', [crypto.randomUUID(), description ?? null, amount, now, now])
    await save()
  }, [run, save])

  const handleUpdateCashEntry = useCallback(async (id, { description, amount }) => {
    const now = new Date().toISOString()
    run('UPDATE cash_entries SET description=?, amount=?, updated_at=? WHERE id=?', [description ?? null, amount, now, id])
    await save()
  }, [run, save])

  const handleDeleteCashEntry = useCallback(async (id) => {
    run('DELETE FROM cash_entries WHERE id=?', [id])
    await save()
  }, [run, save])

  // Net worth account callbacks
  const saveNWSnapshot = useCallback(() => {
    const accounts = query('SELECT is_liability, balance FROM net_worth_accounts')
    const totalAssets = accounts.filter(a => !a.is_liability).reduce((s, a) => s + a.balance, 0)
    const totalLiabilities = accounts.filter(a => a.is_liability).reduce((s, a) => s + a.balance, 0)
    const netWorth = totalAssets - totalLiabilities
    const lastSnap = query('SELECT net_worth FROM net_worth_snapshots ORDER BY date DESC LIMIT 1')
    if (lastSnap.length && Math.round(lastSnap[0].net_worth * 100) === Math.round(netWorth * 100)) return
    const today = new Date().toISOString().split('T')[0]
    run('DELETE FROM net_worth_snapshots WHERE date=?', [today])
    run('INSERT INTO net_worth_snapshots VALUES (?,?,?,?,?)',
      [crypto.randomUUID(), today, totalAssets, totalLiabilities, netWorth])
  }, [query, run])

  const handleAddNWAccount = useCallback(async (acct) => {
    run('INSERT INTO net_worth_accounts VALUES (?,?,?,?,?,?,?,?)',
      [acct.id, acct.name, acct.institution, acct.account_type, acct.is_liability, acct.balance, acct.last_updated, acct.sort_order])
    saveNWSnapshot()
    await save()
  }, [run, save, saveNWSnapshot])

  const handleUpdateNWAccount = useCallback(async (id, fields) => {
    const now = new Date().toISOString().split('T')[0]
    run('UPDATE net_worth_accounts SET name=?,institution=?,account_type=?,is_liability=?,balance=?,last_updated=? WHERE id=?',
      [fields.name, fields.institution, fields.account_type, fields.is_liability, fields.balance, fields.last_updated ?? now, id])
    saveNWSnapshot()
    await save()
  }, [run, save, saveNWSnapshot])

  const handleDeleteNWAccount = useCallback(async (id) => {
    run('DELETE FROM net_worth_accounts WHERE id=?', [id])
    saveNWSnapshot()
    await save()
  }, [run, save, saveNWSnapshot])

  const handleImportNWCSV = useCallback(async (accounts, asOfDate, replaceAll = false) => {
    if (replaceAll) {
      run('DELETE FROM net_worth_accounts', [])
      for (const acct of accounts) {
        run('INSERT INTO net_worth_accounts VALUES (?,?,?,?,?,?,?,?)',
          [acct.id, acct.name, acct.institution, acct.account_type, acct.is_liability, acct.balance, acct.last_updated, acct.sort_order])
      }
    } else {
      for (const acct of accounts) {
        const existing = query('SELECT id FROM net_worth_accounts WHERE institution=? AND name=?', [acct.institution, acct.name])
        if (existing.length) {
          run('UPDATE net_worth_accounts SET balance=?,account_type=?,is_liability=?,last_updated=? WHERE id=?',
            [acct.balance, acct.account_type, acct.is_liability, acct.last_updated, existing[0].id])
        } else {
          run('INSERT INTO net_worth_accounts VALUES (?,?,?,?,?,?,?,?)',
            [acct.id, acct.name, acct.institution, acct.account_type, acct.is_liability, acct.balance, acct.last_updated, acct.sort_order])
        }
      }
    }
    const totalAssets = accounts.filter(a => !a.is_liability).reduce((s, a) => s + a.balance, 0)
    const totalLiabilities = accounts.filter(a => a.is_liability).reduce((s, a) => s + a.balance, 0)
    run('DELETE FROM net_worth_snapshots WHERE date=?', [asOfDate])
    run('INSERT INTO net_worth_snapshots VALUES (?,?,?,?,?)',
      [crypto.randomUUID(), asOfDate, totalAssets, totalLiabilities, totalAssets - totalLiabilities])
    await save()
  }, [run, query, save])

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
          `INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [e.id, e.date, e.merchant, e.description, e.amount, e.currency,
           e.amount_usd, e.category, e.payment_method, e.receipt_filename,
           e.source, e.notes, e.created_at, e.updated_at, e.type ?? 'Expense', 0, null]
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
              Hunt-Garcia Household Tracker
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
          <ErrorBoundary>
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
            ) : formState === 'cash' ? (
              <Cash
                entries={cashEntries}
                bankAccounts={nwBankAccounts}
                onAdd={handleAddCashEntry}
                onUpdate={handleUpdateCashEntry}
                onDelete={handleDeleteCashEntry}
                onBack={() => setFormState(null)}
                onViewNetWorth={() => setFormState('networth')}
              />
            ) : formState === 'networth' ? (
              <NetWorth
                accounts={nwAccounts}
                snapshots={nwSnapshots}
                onAdd={handleAddNWAccount}
                onUpdate={handleUpdateNWAccount}
                onDelete={handleDeleteNWAccount}
                onImportCSV={handleImportNWCSV}
                onBack={() => setFormState(null)}
              />
            ) : formState === 'budget' ? (
              <Budget
                categories={categories}
                budgets={budgets}
                expenses={expenses}
                transactionTypes={transactionTypes}
                onSetBudget={handleSetBudget}
                onDeleteBudget={handleDeleteBudget}
                onAddCategory={handleAddCategory}
                onEditExpense={(expense) => { setReturnTo('budget'); setFormState(expense) }}
                onBack={() => setFormState(null)}
                initialYear={dashboardYear}
                initialMonth={dashboardMonth}
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
                cashTotal={cashEntries.reduce((s, e) => s + (e.amount ?? 0), 0) + nwBankAccounts.reduce((s, a) => s + a.balance, 0)}
                netWorthTotal={nwAccounts.reduce((s, a) => s + (a.is_liability ? -a.balance : a.balance), 0)}
                hasNWAccounts={nwAccounts.length > 0}
                selectedYear={dashboardYear}
                selectedMonth={dashboardMonth}
                setSelectedYear={setDashboardYear}
                setSelectedMonth={setDashboardMonth}
                onViewList={(filters) => { setListFilters(filters || {}); setFormState('list') }}
                onAdd={() => setFormState('add')}
                onImportCSV={() => setFormState('csv')}
                onViewReports={(filters) => { setReportFilters(filters || {}); setFormState('reports') }}
                onViewBudget={() => { setFormState('budget') }}
                onViewCash={() => setFormState('cash')}
                onViewNetWorth={() => setFormState('networth')}
              />
            )}
          </ErrorBoundary>
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

function Dashboard({ expenses, transactionTypes, budgets, cashTotal, netWorthTotal, hasNWAccounts, selectedYear, selectedMonth, setSelectedYear, setSelectedMonth, onViewList, onAdd, onImportCSV, onViewReports, onViewBudget, onViewCash, onViewNetWorth }) {
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
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => onViewList({ ...monthFilters, filterType: '__income__' })}
          className="bg-green-900/30 hover:bg-green-900/50 border border-green-500/30 rounded-2xl p-4 text-left transition-colors"
        >
          <div className="flex items-center gap-1.5 text-green-400 mb-2">
            <TrendingUp size={15} />
            <span className="text-xs font-medium">Income</span>
          </div>
          <p className="text-xl font-bold text-white">${totalIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
        </button>

        <button
          onClick={() => onViewList({ ...monthFilters, filterType: '__expense__' })}
          className="bg-gray-900/60 hover:bg-gray-900/80 border border-white/10 rounded-2xl p-4 text-left transition-colors"
        >
          <div className="flex items-center gap-1.5 text-orange-300 mb-2">
            <TrendingDown size={15} />
            <span className="text-xs font-medium">Expenses</span>
          </div>
          <p className="text-xl font-bold text-white">${totalExpenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
        </button>

        <button
          onClick={onViewCash}
          className="bg-teal-900/30 hover:bg-teal-900/50 border border-teal-500/30 rounded-2xl p-4 text-left transition-colors"
        >
          <div className="flex items-center gap-1.5 text-teal-400 mb-2">
            <Wallet size={15} />
            <span className="text-xs font-medium">Cash</span>
          </div>
          <p className="text-xl font-bold text-white">${cashTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
        </button>
      </div>

      {/* Net Worth tile */}
      <button
        onClick={onViewNetWorth}
        className="w-full bg-purple-900/30 hover:bg-purple-900/50 border border-purple-500/30 rounded-2xl p-4 text-left transition-colors"
      >
        <div className="flex items-center gap-1.5 text-purple-400 mb-2">
          <Landmark size={15} />
          <span className="text-xs font-medium">Net Worth</span>
        </div>
        {hasNWAccounts ? (
          <p className="text-xl font-bold text-white">
            {netWorthTotal >= 0 ? '' : '−'}${Math.abs(netWorthTotal).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        ) : (
          <p className="text-sm text-purple-300/60">Tap to set up accounts →</p>
        )}
      </button>

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
        <div className="grid grid-cols-3 gap-3">
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
          <button
            onClick={onViewNetWorth}
            className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl py-4 transition-colors"
          >
            <Landmark size={20} />
            <span className="text-xs font-medium">Net Worth</span>
          </button>
        </div>
      </div>

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
