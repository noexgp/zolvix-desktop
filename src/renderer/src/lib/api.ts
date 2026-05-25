let _refreshing: Promise<void> | null = null

export async function getServerUrl(): Promise<string> {
  return (await window.electron.store.get('serverUrl') as string) ?? ''
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = await getServerUrl()
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })

  if (res.status === 401) {
    if (!_refreshing) {
      _refreshing = fetch(`${base}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      }).then(() => { _refreshing = null })
    }
    await _refreshing
    return fetch(`${base}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  }

  return res
}
