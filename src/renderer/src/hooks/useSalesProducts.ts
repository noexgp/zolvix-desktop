import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { db } from '@/lib/db'
import type { CachedProduct } from '@/lib/db'

const DEBOUNCE_MS = 250
const MAX_FALLBACK = 30

export function buildProductSearchUrl(search: string): string {
  const q = search.trim()
  if (!q) return '/api/product/cart?topSellers=true'
  return `/api/product/cart?q=${encodeURIComponent(q)}`
}

export function fallbackFilter(cache: CachedProduct[], search: string): CachedProduct[] {
  const q = search.trim().toLowerCase()
  if (!q) return cache.slice(0, MAX_FALLBACK)
  return cache
    .filter(p => p.isActive && (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    ))
    .slice(0, MAX_FALLBACK)
}

async function loadCachedFallback(search: string): Promise<CachedProduct[]> {
  const all = await db.products.toArray()
  return fallbackFilter(all, search)
}

export function useSalesProducts({ search }: { search: string }): { products: CachedProduct[]; loading: boolean } {
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiFetch(buildProductSearchUrl(search))
        if (cancelled) return
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
        if (cancelled) return
        setProducts(Array.isArray(data) ? (data as CachedProduct[]) : [])
      } catch {
        if (cancelled) return
        const cached = await loadCachedFallback(search)
        if (cancelled) return
        setProducts(cached)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  return { products, loading }
}
