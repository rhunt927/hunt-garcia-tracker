import { useState, useEffect, useCallback } from 'react'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly profile email'

// localStorage: token and profile both persist until explicit sign-out
function loadSession() {
  try {
    const token = localStorage.getItem('et_token')
    const user = JSON.parse(localStorage.getItem('et_user') || 'null')
    // Drop any previously stored invalid base64 picture
    if (user?.picture?.startsWith('data:')) user.picture = null
    return { token, user }
  } catch { return { token: null, user: null } }
}

function saveSession(user, token) {
  localStorage.setItem('et_token', token)
  localStorage.setItem('et_user', JSON.stringify(user))
}

function clearSession() {
  localStorage.removeItem('et_token')
  localStorage.removeItem('et_user')
}

async function fetchUserProfile(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return { name: data.name || '', email: data.email || '', picture: data.picture || null }
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [gisReady, setGisReady] = useState(false)

  useEffect(() => {
    const { token, user: savedUser } = loadSession()
    if (token && savedUser) {
      setUser(savedUser)
      setAccessToken(token)
      setLoading(false)
      fetchUserProfile(token).then(userObj => {
        saveSession(userObj, token)
        setUser(userObj)
      }).catch(() => {})
    }

    // Always load GIS script — needed for login and for re-login after token expiry
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      setGisReady(true)
      if (!token) setLoading(false)
    }
    script.onerror = () => { if (!token) setLoading(false) }
    document.body.appendChild(script)
  }, [])

  const login = useCallback(() => {
    if (!window.google?.accounts?.oauth2) return
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: async (response) => {
        if (response.error) return
        try {
          const userObj = await fetchUserProfile(response.access_token)
          saveSession(userObj, response.access_token)
          setUser(userObj)
          setAccessToken(response.access_token)
        } catch {
          setUser({ name: '', email: '', picture: null })
          setAccessToken(response.access_token)
        }
      },
    })
    tokenClient.requestAccessToken()
  }, [])

  // Called by the user via the Sign Out button
  function logout() {
    const token = accessToken
    // Clear state first so the UI immediately shows the login screen
    clearSession()
    setUser(null)
    setAccessToken(null)
    // Best-effort revoke in the background — don't block or redirect
    try { window.google?.accounts?.oauth2?.revoke(token, () => {}) } catch {}
  }

  // Called automatically when Drive returns 401/403 — clears stale token WITHOUT
  // revoking it (revoking a stale token can block the next sign-in attempt)
  function clearAuth() {
    clearSession()
    setUser(null)
    setAccessToken(null)
  }

  return { user, accessToken, loading, gisReady, login, logout, clearAuth }
}
