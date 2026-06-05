export function LoginScreen({ onLogin, gisReady }) {
  function clearAndReload() {
    localStorage.removeItem('et_token')
    localStorage.removeItem('et_user')
    window.location.reload()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${import.meta.env.BASE_URL}panama.jpg')` }}
      />
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 w-full max-w-sm shadow-xl text-center border border-white/10">
        <div className="mb-4">
          <svg viewBox="0 0 40 40" className="w-12 h-12 mx-auto rounded-lg shadow">
            <rect x="0" y="0" width="20" height="20" fill="#ffffff"/>
            <rect x="20" y="0" width="20" height="20" fill="#D21034"/>
            <rect x="0" y="20" width="20" height="20" fill="#005293"/>
            <rect x="20" y="20" width="20" height="20" fill="#ffffff"/>
            <polygon points="10,5 11.2,8.6 15,8.6 12,10.8 13.2,14.4 10,12.2 6.8,14.4 8,10.8 5,8.6 8.8,8.6" fill="#005293"/>
            <polygon points="30,21 31.2,24.6 35,24.6 32,26.8 33.2,30.4 30,28.2 26.8,30.4 28,26.8 25,24.6 28.8,24.6" fill="#D21034"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-1">Hunt-Garcia Household Tracker</h1>
        <p className="text-blue-300 text-xs mb-4">Panama City, Panamá</p>
        <p className="text-gray-400 text-sm mb-8">
          Sign in with Google to access your expenses stored in Google Drive.
        </p>
        <button
          onClick={onLogin}
          disabled={!gisReady}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-3"
        >
          {gisReady ? (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </>
          ) : (
            'Loading...'
          )}
        </button>
        <button
          onClick={clearAndReload}
          className="mt-4 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Having trouble? Reset &amp; reload
        </button>
      </div>
    </div>
  )
}
