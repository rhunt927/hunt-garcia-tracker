import { useState, useEffect, useRef, useCallback } from 'react'
import initSqlJs from 'sql.js'
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url'
import { loadDatabase, saveDatabase } from './useGoogleDrive'

const DEFAULT_CATEGORIES = [
  'dining', 'groceries', 'transport', 'lodging', 'shopping',
  'equipment', 'professional_services', 'shipping', 'packing_supplies', 'storage', 'other'
]
const DEFAULT_PAYMENT_METHODS = [
  'schwab_checking', 'boa_checking', 'schwab_brokerage', 'cash', 'zelle', 'discover'
]
const DEFAULT_EXCHANGE_RATES = { PAB: 1.00, EUR: 1.08 }

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
  `)

  const existingCats = db.exec('SELECT COUNT(*) FROM categories')[0]?.values[0][0]
  if (!existingCats) {
    DEFAULT_CATEGORIES.forEach(c => db.run('INSERT OR IGNORE INTO categories VALUES (?)', [c]))
    DEFAULT_PAYMENT_METHODS.forEach(p => db.run('INSERT OR IGNORE INTO payment_methods VALUES (?)', [p]))
    Object.entries(DEFAULT_EXCHANGE_RATES).forEach(([c, r]) =>
      db.run('INSERT OR IGNORE INTO exchange_rates VALUES (?, ?)', [c, r])
    )
  }
}

export function useDatabase(accessToken) {
  const [db, setDb] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
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

        if (!fileId) {
          const newFileId = await saveDatabase(accessToken, folderId, null, database.export())
          driveRef.current.fileId = newFileId
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
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
  }, [db])

  return { db, loading, error, save, query, run }
}
