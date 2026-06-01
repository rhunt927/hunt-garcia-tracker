import { useAuth } from './hooks/useAuth'
import { useDatabase } from './hooks/useDatabase'
import { LoginScreen } from './components/LoginScreen'

export default function App() {
  const { user, accessToken, loading, login, logout } = useAuth()
  const { db, loading: dbLoading, error: dbError, query, run, save } = useDatabase(accessToken)

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

  const categories = db ? query('SELECT name FROM categories ORDER BY name') : []
  const expenses = db ? query('SELECT * FROM expenses ORDER BY date DESC LIMIT 5') : []

  async function handleTestInsert() {
    run(
      `INSERT INTO expenses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(), '2026-06-01', 'SuperFarmacias', 'Test expense',
        12.50, 'USD', 12.50, 'other', 'discover', null, 'manual', 'Test note',
        new Date().toISOString(), new Date().toISOString()
      ]
    )
    await save()
    alert('Saved to Google Drive! Check your Drive for ExpenseTracker/expenses.db')
  }

  return (
    <div
      className="min-h-screen text-white p-6 relative"
      style={{ backgroundImage: "url('/panama.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Expense Tracker</h1>
          <div className="flex items-center gap-3">
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
            <span className="text-sm text-gray-300">{user.name}</span>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-white transition-colors">
              Sign out
            </button>
          </div>
        </div>

        {dbLoading && <p className="text-gray-400">Connecting to Google Drive...</p>}
        {dbError && <p className="text-red-400">Database error: {dbError}</p>}

        {db && (
          <div className="space-y-6">
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <h2 className="font-semibold mb-2">✅ Database connected</h2>
              <p className="text-sm text-gray-400">Categories loaded: {categories.length}</p>
              <p className="text-sm text-gray-400">Expenses: {expenses.length}</p>
            </div>

            <button
              onClick={handleTestInsert}
              className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-semibold transition-colors"
            >
              Test: Insert expense & save to Drive
            </button>

            {expenses.length > 0 && (
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <h2 className="font-semibold mb-3">Recent Expenses</h2>
                <div className="space-y-2">
                  {expenses.map(e => (
                    <div key={e.id} className="flex justify-between text-sm">
                      <span className="text-gray-300">{e.merchant}</span>
                      <span className="text-green-400">${e.amount_usd.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
