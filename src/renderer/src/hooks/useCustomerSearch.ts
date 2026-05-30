import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { db } from '@/lib/db'
import type { CachedCustomer } from '@/lib/db'

const DEBOUNCE_MS = 250
const MAX_FALLBACK = 30

export function buildCustomerSearchUrl(search: string): string | null {
  const q = search.trim()
  if (!q) return null
  return `/api/customer?search=${encodeURIComponent(q)}&limit=${MAX_FALLBACK}`
}

async function loadCachedFallback(search: string): Promise<CachedCustomer[]> {
  const all = await db.customers.toArray()
  const q = search.trim().toLowerCase()
  return all
    .filter(c => c.isActive && (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    ))
    .slice(0, MAX_FALLBACK)
}

export function useCustomerSearch({ search }: { search: string }): { customers: CachedCustomer[]; loading: boolean } {
  const [customers, setCustomers] = useState<CachedCustomer[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const url = buildCustomerSearchUrl(search)
    if (!url) {
      setCustomers([])
      setLoading(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiFetch(url)
        if (cancelled) return
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
        if (cancelled) return
        const list: CachedCustomer[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.customers) ? data.customers : []
        setCustomers(list)
      } catch {
        if (cancelled) return
        const cached = await loadCachedFallback(search)
        if (cancelled) return
        setCustomers(cached)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  return { customers, loading }
}
