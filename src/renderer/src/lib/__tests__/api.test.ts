import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('apiFetch', () => {
  beforeEach(() => {
    window.electron = {
      store: { get: vi.fn().mockResolvedValue('https://zolvix.test'), set: vi.fn() },
      print: { lx310: vi.fn(), getPrinters: vi.fn() },
    } as any
    vi.resetModules()
  })

  it('prepends serverUrl to path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { apiFetch } = await import('../api')
    await apiFetch('/api/test')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://zolvix.test/api/test',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('retries after 401 with refresh', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      callCount++
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(new Response('{}', { status: 200 }))
      }
      if (callCount === 1) {
        return Promise.resolve(new Response('{}', { status: 401 }))
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { apiFetch } = await import('../api')
    const res = await apiFetch('/api/protected')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/refresh'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws on failed refresh', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      callCount++
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(new Response('{}', { status: 401 }))
      }
      return Promise.resolve(new Response('{}', { status: 401 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { apiFetch } = await import('../api')
    await expect(apiFetch('/api/protected')).rejects.toThrow('session_expired')
  })
})
