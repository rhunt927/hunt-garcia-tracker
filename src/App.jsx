import { useAuth } from './hooks/useAuth'
import { LoginScreen } from './components/LoginScreen'

export default function App() {
  const { user, loading, login, logout } = useAuth()

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
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Expense Tracker</h1>
          <div className="flex items-center gap-3">
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
            <span className="text-sm text-gray-400">{user.name}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
        <p className="text-gray-400">✅ Signed in successfully. Ready to build!</p>
      </div>
    </div>
  )
}
