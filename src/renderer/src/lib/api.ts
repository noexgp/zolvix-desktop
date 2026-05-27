let _refreshing: Promise<void> | null = null

export async function getServerUrl(): Promise<string> {
  return (await window.electron.store.get('serverUrl') as string) ?? ''
}

// Wraps the IPC result in a standard Response so all callers work unchanged.
function ipcResultToResponse(result: { status: number; headers: Record<string, string | string[]>; body: string }): Response {
  const flatHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(result.headers)) {
    flatHeaders[k] = Array.isArray(v) ? v.join(', ') : v
  }
  return new Response(result.body, { status: result.status, headers: flatHeaders })
}

async function ipcFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.headers) {
    const h = init.headers as Record<string, string>
    for (const [k, v] of Object.entries(h)) headers[k] = v
  }
  const result = await window.electron.api.fetch({
    url,
    method: (init.method ?? 'GET').toUpperCase(),
    headers,
    body: init.body as string | undefined,
  })
  return ipcResultToResponse(result)
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = await getServerUrl()
  const res = await ipcFetch(`${base}${path}`, init)

  if (res.status === 401) {
    if (!_refreshing) {
      _refreshing = ipcFetch(`${base}/api/auth/refresh`, { method: 'POST' })
        .then(r => {
          _refreshing = null
          if (!r.ok) throw new Error('session_expired')
        })
        .catch(err => {
          _refreshing = null
          throw err
        })
    }
    await _refreshing
    return ipcFetch(`${base}${path}`, init)
  }

  return res
}
