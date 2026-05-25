import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('electron store bridge', () => {
  beforeEach(() => {
    window.electron = {
      store: {
        get: vi.fn().mockResolvedValue('https://test.com'),
        set: vi.fn().mockResolvedValue(undefined),
      },
      print: { lx310: vi.fn(), getPrinters: vi.fn() },
    } as any
  })

  it('get returns value from store', async () => {
    const val = await window.electron.store.get('serverUrl')
    expect(val).toBe('https://test.com')
  })

  it('set calls the store', async () => {
    await window.electron.store.set('serverUrl', 'https://new.com')
    expect(window.electron.store.set).toHaveBeenCalledWith('serverUrl', 'https://new.com')
  })
})
