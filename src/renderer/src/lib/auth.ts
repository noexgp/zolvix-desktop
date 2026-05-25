import { apiFetch } from './api'

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: string
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Login failed')
  }
  const data = await res.json()
  return data.user as CurrentUser
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
}

export async function getSession(): Promise<CurrentUser | null> {
  try {
    const res = await apiFetch('/api/auth/session')
    if (!res.ok) return null
    const data = await res.json()
    return data.user ?? null
  } catch {
    return null
  }
}
