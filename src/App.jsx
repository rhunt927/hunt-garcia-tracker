import { useState, useCallback } from 'react'
import { Menu, TrendingUp, TrendingDown, Plus, FileUp, List, BarChart2 } from 'lucide-react'
import { Reports } from './components/Reports'
import { useAuth } from './hooks/useAuth'
import { useDatabase } from './hooks/useDatabase'
import { LoginScreen } from './components/LoginScreen'
import { ExpenseForm } from './components/ExpenseForm'
import { ExpenseList } from './components/ExpenseList'
import { CSVImport } from './components/CSVImport'
import { SettingsSidebar } from './components/SettingsSidebar'

export default function App() {
  const { user, accessToken, loading, login, logout } = useAuth()
  const { db, loading: dbLoading, error: dbError, query, run, save } = useDatabase(accessToken)

  // null = dashboard, 'list' = full list, 'add' = add form, 'csv' = import, expense object = edit form
  const [formState, setFormState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const categories = db ? query('SELECT name FROM categories ORDER BY name').map(r => r.name) : []
  const paymentMethods = db ? query('SELECT name FROM payment_methods ORDER BY name').map(r => r.name) : []
  const exchangeRates = db
    ? Object.fromEntries(query('SELECT currency, rate FROM exchange_rates').map(r => [r.currency, r.rate]))
    : {}
  const transactionTypes = db ? query('SELECT name, is_income FROM transaction_types ORDER BY is_income, name') : []
  const expenses = db ? query('SELECT * FROM expenses ORDER BY date DESC, created_at DESC') : []

  const handleSave = useCallback(async (expense) => {
    setSaving(true)
    try {
      if (formState === 'add') {
        run(
          `INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            expense.id, expense.date, expense.merchant, expense.description,
            expense.amount, expense.currency, expense.amount_usd,
            expense.category, expense.payment_method, expense.receipt_filename,
            expense.source, expense.notes, expense.created_at, expense.updated_at,
            expense.type ?? 'Expense',
          ]
        )
      } else {
        run(
          `UPDATE expenses SET date=?, merchant=?, description=?, amount=?, currency=?,
           amount_usd=?, type=?, category=?, payment_method=?, notes=?, updated_at=? WHERE id=?`,
          [
            expense.date, expense.merchant, expense.description,
            expense.amount, expense.currency, expense.amount_usd,
            expense.type, expense.category, expense.payment_method, expense.notes,
            expense.updated_at, expense.id,
          ]
        )
      }
      await save()
      setFormState(null)
    } finally {
      setSaving(false)
    }
  }, [formState, run, save])

  const handleDelete = useCallback(async (id) => {
    run('DELETE FROM expenses WHERE id=?', [id])
    await save()
  }, [run, save])

  const handleBulkDelete = useCallback(async (ids) => {
    ids.forEach(id => run('DELETE FROM expenses WHERE id=?', [id]))
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
    await save()
  }, [run, save])

  const handleDeleteCategory = useCallback(async (name) => {
    run('DELETE FROM categories WHERE name=?', [name])
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

  const handleToggleTransactionTypeIncome = useCallback(async (name, is_income) => {
    run('UPDATE transaction_types SET is_income=? WHERE name=?', [is_income, name])
    await save()
  }, [run, save])

  const handleCSVImport = useCallback(async (rows) => {
    setSaving(true)
    try {
      for (const e of rows) {
        run(
          `INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [e.id, e.date, e.merchant, e.description, e.amount, e.currency,
           e.amount_usd, e.category, e.payment_method, e.receipt_filename,
           e.source, e.notes, e.created_at, e.updated_at, e.type ?? 'Expense']
        )
      }
      await save()
      setFormState(null)
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
    return <LoginScreen onLogin={login} />
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
        onLogout={logout}
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
                existingExpenses={expenses}
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
                onCancel={() => setFormState(null)}
                {...categoryProps}
              />
            ) : formState === 'reports' ? (
              <Reports
                expenses={expenses}
                transactionTypes={transactionTypes}
                categories={categories}
                onBack={() => setFormState(null)}
              />
            ) : formState === 'list' ? (
              <ExpenseList
                expenses={expenses}
                categories={categories}
                transactionTypes={transactionTypes}
                onAdd={() => setFormState('add')}
                onEdit={(expense) => setFormState(expense)}
                onDelete={handleDelete}
                onBulkDelete={handleBulkDelete}
                onImportCSV={() => setFormState('csv')}
                onBack={() => setFormState(null)}
              />
            ) : (
              <Dashboard
                expenses={expenses}
                transactionTypes={transactionTypes}
                onViewList={() => setFormState('list')}
                onAdd={() => setFormState('add')}
                onImportCSV={() => setFormState('csv')}
                onViewReports={() => setFormState('reports')}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Dashboard({ expenses, transactionTypes, onViewList, onAdd, onImportCSV, onViewReports }) {
  const incomeTypeNames = new Set((transactionTypes ?? []).filter(t => t.is_income).map(t => t.name))

  const totalIncome = expenses
    .filter(e => incomeTypeNames.has(e.type))
    .reduce((s, e) => s + (e.amount_usd ?? 0), 0)

  const totalExpenses = expenses
    .filter(e => !incomeTypeNames.has(e.type))
    .reduce((s, e) => s + (e.amount_usd ?? 0), 0)

  const net = totalIncome - totalExpenses

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onViewList}
          className="bg-green-900/30 hover:bg-green-900/50 border border-green-500/30 rounded-2xl p-5 text-left transition-colors"
        >
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <TrendingUp size={18} />
            <span className="text-sm font-medium">Total Income</span>
          </div>
          <p className="text-2xl font-bold text-white">${totalIncome.toFixed(2)}</p>
        </button>

        <button
          onClick={onViewList}
          className="bg-gray-900/60 hover:bg-gray-900/80 border border-white/10 rounded-2xl p-5 text-left transition-colors"
        >
          <div className="flex items-center gap-2 text-orange-300 mb-2">
            <TrendingDown size={18} />
            <span className="text-sm font-medium">Total Expenses</span>
          </div>
          <p className="text-2xl font-bold text-white">${totalExpenses.toFixed(2)}</p>
        </button>
      </div>

      {/* Net */}
      <div className="bg-gray-900/60 border border-white/10 rounded-2xl px-5 py-4 flex items-center justify-between">
        <span className="text-sm text-gray-400">Net</span>
        <span className={`text-xl font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {net >= 0 ? '+' : ''}${net.toFixed(2)}
        </span>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={onAdd}
          className="flex flex-col items-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl py-4 transition-colors"
        >
          <Plus size={22} />
          <span className="text-xs font-medium">Add</span>
        </button>
        <button
          onClick={onViewList}
          className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl py-4 transition-colors"
        >
          <List size={22} />
          <span className="text-xs font-medium">Transactions</span>
        </button>
        <button
          onClick={onViewReports}
          className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl py-4 transition-colors"
        >
          <BarChart2 size={22} />
          <span className="text-xs font-medium">Reports</span>
        </button>
        <button
          onClick={onImportCSV}
          className="flex flex-col items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded-xl py-4 transition-colors"
        >
          <FileUp size={22} />
          <span className="text-xs font-medium">Import</span>
        </button>
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
