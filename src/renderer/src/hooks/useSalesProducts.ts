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

export function isLikelyCode(text: string): boolean {
  const q = text.trim()
  return q.length > 0 && !/\s/.test(q)
}

export async function scanProduct(q: string): Promise<CachedProduct | null> {
  const text = q.trim()
  if (!text) return null
  try {
    const res = await apiFetch(`/api/product/scan?q=${encodeURIComponent(text)}`)
    if (res.ok) {
      const data = (await res.json()) as RawProduct | null
      // Strict accept: only treat as a real scan if barcode or SKU matches exactly.
      // Blocks the server's name-contains fallback from silently auto-adding.
      if (data && (data.barcode === text || data.sku === text)) {
        return flatten(data)
      }
    }
  } catch {
    // fall through to offline lookup
  }
  // Offline / strict-rejected fallback: exact match against the cached set.
  const all = await db.products.toArray()
  return all.find(p => p.isActive && (p.barcode === text || p.sku === text)) ?? null
}
