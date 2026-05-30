import { describe, it, expect } from 'vitest'
import { buildProductSearchUrl, fallbackFilter } from '../useSalesProducts'
import type { CachedProduct } from '@/lib/db'

const p = (over: Partial<CachedProduct>): CachedProduct => ({
  id: over.id ?? 'p',
  name: over.name ?? 'Product',
  sku: over.sku ?? 'SKU',
  barcode: over.barcode ?? null,
  price: over.price ?? 100,
  stock: over.stock ?? 10,
  isActive: over.isActive ?? true,
} as unknown as CachedProduct)

describe('buildProductSearchUrl', () => {
  it('uses topSellers=true when search is empty or whitespace', () => {
    expect(buildProductSearchUrl('')).toBe('/api/product/cart?topSellers=true')
    expect(buildProductSearchUrl('   ')).toBe('/api/product/cart?topSellers=true')
  })
  it('sends q with URL-encoded query when typed', () => {
    expect(buildProductSearchUrl('hello world')).toBe('/api/product/cart?q=hello%20world')
    expect(buildProductSearchUrl('a&b')).toBe('/api/product/cart?q=a%26b')
  })
})

describe('fallbackFilter', () => {
  const cache: CachedProduct[] = [
    p({ id: '1', name: 'Apple Juice', sku: 'AJ-1' }),
    p({ id: '2', name: 'Banana Bread', sku: 'BB-2', barcode: '1234567890' }),
    p({ id: '3', name: 'Inactive Item', sku: 'X', isActive: false }),
    p({ id: '4', name: 'Apple Pie', sku: 'AP-3' }),
  ]
  it('empty query → first 30 ACTIVE items, in input order', () => {
    expect(fallbackFilter(cache, '').map(x => x.id)).toEqual(['1', '2', '4'])
  })
  it('matches name (case-insensitive)', () => {
    expect(fallbackFilter(cache, 'apple').map(x => x.id).sort()).toEqual(['1', '4'])
  })
  it('matches sku', () => {
    expect(fallbackFilter(cache, 'BB').map(x => x.id)).toEqual(['2'])
  })
  it('matches barcode substring', () => {
    expect(fallbackFilter(cache, '12345').map(x => x.id)).toEqual(['2'])
  })
  it('typed query excludes inactive', () => {
    expect(fallbackFilter(cache, 'inactive')).toEqual([])
  })
  it('caps results at 30', () => {
    const many = Array.from({ length: 50 }, (_, i) => p({ id: String(i), name: `Item ${i}`, sku: `S${i}` }))
    expect(fallbackFilter(many, '').length).toBe(30)
  })
})
