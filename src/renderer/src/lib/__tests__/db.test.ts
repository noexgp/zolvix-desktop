import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { isCacheExpired, setCacheMeta, getCacheMeta } from '../db'

describe('cache TTL helpers', () => {
  it('reports expired when no cache meta exists', async () => {
    const expired = await isCacheExpired('products', 5 * 60 * 1000)
    expect(expired).toBe(true)
  })

  it('reports not expired when recently set', async () => {
    await setCacheMeta('products')
    const expired = await isCacheExpired('products', 5 * 60 * 1000)
    expect(expired).toBe(false)
  })

  it('getCacheMeta returns null when not set', async () => {
    const val = await getCacheMeta('unknown_key')
    expect(val).toBeNull()
  })
})
