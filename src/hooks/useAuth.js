import { useState, useEffect } from 'react'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPES = 'https://www.googleapis.com/auth/drive.file'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => setLoading(false)
    document.body.appendChild(script)
  }, [])

  function login() {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) return
        setAccessToken(response.access_token)
        fetchUserInfo(response.access_token)
      },
    })
    tokenClient.requestAccessToken()
  }

  async function fetchUserInfo(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setUser({ name: data.name, email: data.email, picture: data.picture })
  }

  function logout() {
    if (accessToken) window.google.accounts.oauth2.revoke(accessToken)
    setUser(null)
    setAccessToken(null)
  }

  return { user, accessToken, loading, login, logout }
}
