import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { db } from '@/lib/db'
import type { CachedProduct } from '@/lib/db'

const DEBOUNCE_MS = 250
const MAX_FALLBACK = 30

type RawProduct = CachedProduct & { category?: { id: string; name: string } | null }

function flatten(p: RawProduct): CachedProduct {
  return {
    ...p,
    categoryId: p.categoryId ?? p.category?.id ?? '',
    categoryName: p.categoryName ?? p.category?.name ?? '',
  }
}

export function buildProductSearchUrl(search: string): string {
  const q = search.trim()
  if (!q) return '/api/product/cart?topSellers=true'
  return `/api/product/cart?q=${encodeURIComponent(q)}`
}

export function fallbackFilter(cache: CachedProduct[], search: string): CachedProduct[] {
  const q = search.trim().toLowerCase()
  const active = cache.filter(p => p.isActive)
  if (!q) return active.slice(0, MAX_FALLBACK)
  return active
    .filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q),
    )
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
        const list = Array.isArray(data) ? (data as RawProduct[]) : []
        setProducts(list.map(flatten))
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
