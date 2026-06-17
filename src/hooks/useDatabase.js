import { useState, useEffect, useRef, useCallback } from 'react'
import initSqlJs from 'sql.js'
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url'
import { loadDatabase, saveDatabase } from './useGoogleDrive'

const DEFAULT_CATEGORIES = [
  'Dining', 'Groceries', 'Transport', 'Lodging', 'Shopping',
  'Equipment', 'Professional Services', 'Shipping', 'Packing Supplies', 'Storage', 'Other'
]
const DEFAULT_PAYMENT_METHODS = [
  'Schwab Checking', 'BOA Checking', 'Schwab Brokerage', 'Cash', 'Zelle', 'Discover', 'Apple Card'
]
const DEFAULT_EXCHANGE_RATES = { PAB: 1.00, EUR: 1.08 }
const DEFAULT_TRANSACTION_TYPES = [
  { name: 'Expense', is_income: 0, is_transfer: 0 },
  { name: 'Income', is_income: 1, is_transfer: 0 },
  { name: 'Transfer', is_income: 0, is_transfer: 1 },
  { name: 'Reimbursement', is_income: 1, is_transfer: 0 },
]

// Maps old underscore/lowercase names → new display names
const NAME_MIGRATIONS = {
  categories: {
    'dining': 'Dining',
    'groceries': 'Groceries',
    'transport': 'Transport',
    'lodging': 'Lodging',
    'shopping': 'Shopping',
    'equipment': 'Equipment',
    'professional_services': 'Professional Services',
    'shipping': 'Shipping',
    'packing_supplies': 'Packing Supplies',
    'storage': 'Storage',
    'other': 'Other',
  },
  payment_methods: {
    'schwab_checking': 'Schwab Checking',
    'boa_checking': 'BOA Checking',
    'schwab_brokerage': 'Schwab Brokerage',
    'cash': 'Cash',
    'zelle': 'Zelle',
    'discover': 'Discover',
    'apple_card': 'Apple Card',
    'chase': 'Chase',
    'csv_apple': 'Apple Card',
    'csv_chase': 'Chase',
    'csv_discover': 'Discover',
    'csv_boa': 'BOA Checking',
    'csv_schwab': 'Schwab Checking',
  },
  transaction_types: {
    'expense': 'Expense',
    'income': 'Income',
    'transfer': 'Transfer',
    'reimbursement': 'Reimbursement',
  },
}

function createSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      merchant TEXT,
      description TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      amount_usd REAL NOT NULL,
      category TEXT,
      payment_method TEXT,
      receipt_filename TEXT,
      source TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS categories (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS payment_methods (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS exchange_rates (currency TEXT PRIMARY KEY, rate REAL);
    CREATE TABLE IF NOT EXISTS transaction_types (
      name TEXT PRIMARY KEY,
      is_income INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS budgets (
      category TEXT NOT NULL,
      year INTEGER NOT NULL,
      monthly_limit REAL NOT NULL,
      PRIMARY KEY (category, year)
    );
  `)

  // Column migrations
  try { db.run('ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT "Expense"') } catch {}
  try { db.run('ALTER TABLE transaction_types ADD COLUMN is_transfer INTEGER DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE expenses ADD COLUMN is_recurring INTEGER DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE expenses ADD COLUMN splits TEXT') } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS cash_entries (
      id TEXT PRIMARY KEY,
      description TEXT,
      amount REAL NOT NULL,
      created_at TEXT,
      updated_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS net_worth_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      institution TEXT,
      account_type TEXT NOT NULL,
      is_liability INTEGER NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      last_updated TEXT,
      sort_order INTEGER DEFAULT 0
    )
  `)

  // Recreate budgets table with year support if it's the old single-column schema
  const budgetMigrated = db.exec("SELECT COUNT(*) FROM migrations WHERE name='budgets_per_year_v1'")[0]?.values[0][0]
  if (!budgetMigrated) {
    db.run('DROP TABLE IF EXISTS budgets')
    db.run('CREATE TABLE budgets (category TEXT NOT NULL, year INTEGER NOT NULL, monthly_limit REAL NOT NULL, PRIMARY KEY (category, year))')
    db.run("INSERT INTO migrations VALUES ('budgets_per_year_v1')")
  }
  // Mark Transfer type as neutral (not income, not expense)
  db.run("UPDATE transaction_types SET is_transfer=1, is_income=0 WHERE name='Transfer'")

  // Seed defaults on first run
  const existingCats = db.exec('SELECT COUNT(*) FROM categories')[0]?.values[0][0]
  if (!existingCats) {
    DEFAULT_CATEGORIES.forEach(c => db.run('INSERT OR IGNORE INTO categories VALUES (?)', [c]))
    DEFAULT_PAYMENT_METHODS.forEach(p => db.run('INSERT OR IGNORE INTO payment_methods VALUES (?)', [p]))
    Object.entries(DEFAULT_EXCHANGE_RATES).forEach(([c, r]) =>
      db.run('INSERT OR IGNORE INTO exchange_rates VALUES (?, ?)', [c, r])
    )
  }

  const existingTypes = db.exec('SELECT COUNT(*) FROM transaction_types')[0]?.values[0][0]
  if (!existingTypes) {
    DEFAULT_TRANSACTION_TYPES.forEach(t =>
      db.run('INSERT OR IGNORE INTO transaction_types VALUES (?, ?, ?)', [t.name, t.is_income, t.is_transfer])
    )
  }

  // One-time migration: rename old underscore/lowercase names to display names
  const alreadyMigrated = db.exec(
    "SELECT COUNT(*) FROM migrations WHERE name='display_names_v1'"
  )[0]?.values[0][0]

  if (!alreadyMigrated) {
    // categories table + expenses.category column
    Object.entries(NAME_MIGRATIONS.categories).forEach(([old, next]) => {
      db.run('UPDATE categories SET name=? WHERE name=?', [next, old])
      db.run('UPDATE expenses SET category=? WHERE category=?', [next, old])
    })
    // payment_methods table + expenses.payment_method column
    Object.entries(NAME_MIGRATIONS.payment_methods).forEach(([old, next]) => {
      db.run('UPDATE payment_methods SET name=? WHERE name=?', [next, old])
      db.run('UPDATE expenses SET payment_method=? WHERE payment_method=?', [next, old])
    })
    // transaction_types table + expenses.type column
    Object.entries(NAME_MIGRATIONS.transaction_types).forEach(([old, next]) => {
      db.run('UPDATE transaction_types SET name=? WHERE name=?', [next, old])
      db.run('UPDATE expenses SET type=? WHERE type=?', [next, old])
    })
    db.run("INSERT INTO migrations VALUES ('display_names_v1')")
  }
}

export function useDatabase(accessToken, onAuthError) {
  const [db, setDb] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [, setTick] = useState(0)
  const driveRef = useRef({ folderId: null, fileId: null })

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false

    async function init() {
      setLoading(true)
      try {
        const SQL = await initSqlJs({ locateFile: () => sqlWasm })
        const { folderId, fileId, data } = await loadDatabase(accessToken)
        if (cancelled) return

        driveRef.current = { folderId, fileId }
        const database = data ? new SQL.Database(data) : new SQL.Database()
        createSchema(database)
        setDb(database)

        // Save immediately after migration so Drive is up to date
        const newFileId = await saveDatabase(accessToken, folderId, fileId ?? null, database.export())
        if (!cancelled) driveRef.current.fileId = newFileId
      } catch (e) {
        if (cancelled) return
        if (e.isAuthError) {
          onAuthError?.()  // stale/invalid token — clear session and show login
        } else {
          setError(e.message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [accessToken])

  const save = useCallback(async () => {
    if (!db || !accessToken) return
    const { folderId, fileId } = driveRef.current
    const newFileId = await saveDatabase(accessToken, folderId, fileId, db.export())
    driveRef.current.fileId = newFileId
  }, [db, accessToken])

  const query = useCallback((sql, params = []) => {
    if (!db) return []
    const result = db.exec(sql, params)
    if (!result.length) return []
    const { columns, values } = result[0]
    return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])))
  }, [db])

  const run = useCallback((sql, params = []) => {
    if (!db) return
    db.run(sql, params)
    setTick(t => t + 1)
  }, [db])

  return { db, loading, error, save, query, run }
}
