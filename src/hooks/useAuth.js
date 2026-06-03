import { useState, useEffect, useCallback } from 'react'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

// sessionStorage: token survives refreshes in same tab, gone when browser closes
// localStorage: profile survives across browser restarts (no token, just name/email/picture)
function loadSession() {
  try {
    const token = sessionStorage.getItem('et_token')
    const user = JSON.parse(localStorage.getItem('et_user') || 'null')
    return { token, user }
  } catch { return { token: null, user: null } }
}

function saveSession(user, token) {
  sessionStorage.setItem('et_token', token)
  localStorage.setItem('et_user', JSON.stringify(user))
}

function clearSession() {
  sessionStorage.removeItem('et_token')
  localStorage.removeItem('et_user')
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session immediately — no popup needed
    const { token, user: savedUser } = loadSession()
    if (token && savedUser) {
      setUser(savedUser)
      setAccessToken(token)
      setLoading(false)
      return
    }

    // Load GIS script for login
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => setLoading(false)
    document.body.appendChild(script)
  }, [])

  const login = useCallback(() => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: async (response) => {
        if (response.error) return
        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${response.access_token}` },
          })
          const data = await res.json()
          const userObj = { name: data.name, email: data.email, picture: data.picture ?? null }
          saveSession(userObj, response.access_token)
          setUser(userObj)
          setAccessToken(response.access_token)
        } catch {
          setUser({ name: 'User', email: '', picture: null })
          setAccessToken(response.access_token)
        }
      },
    })
    tokenClient.requestAccessToken()
  }, [])

  function logout() {
    window.google?.accounts?.oauth2?.revoke(accessToken)
    clearSession()
    setUser(null)
    setAccessToken(null)
  }

  return { user, accessToken, loading, login, logout }
}
