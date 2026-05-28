import { useEffect, useState } from 'react'
import { db, isCacheExpired, setCacheMeta } from '@/lib/db'
import { apiFetch } from '@/lib/api'
import Pagination from '@/components/Pagination'
import ErrorBanner from '@/components/ErrorBanner'
import EmptyState from '@/components/EmptyState'

interface ApiProduct {
  id: string; name: string; sku?: string; barcode?: string; unit?: string
  price: number | string; stock?: number; categoryId?: string; categoryName?: string
  category?: { name?: string }; isActive: boolean; updatedAt: string
  vatType?: string; scDiscountExempt?: boolean
}

const PAGE_SIZE = 20

export default function ProductsPage() {
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    async function load() {
      try {
        const expired = await isCacheExpired('products', 5 * 60 * 1000)
        if (!expired) {
          setProducts(await db.products.toArray() as unknown as ApiProduct[])
          return
        }
        const res = await apiFetch('/api/product?limit=500&isActive=true')
        if (!res.ok) throw new Error('Failed to load products')
        const data = await res.json()
        const items: ApiProduct[] = Array.isArray(data) ? data : (data.data ?? [])
        await db.products.clear()
        await db.products.bulkPut(items.map(p => ({
          id: p.id, name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '', unit: p.unit ?? '',
          price: Number(p.price), stock: p.stock ?? 0, categoryId: p.categoryId ?? '',
          categoryName: p.categoryName ?? p.category?.name ?? '',
          isActive: p.isActive, updatedAt: p.updatedAt,
          vatType: p.vatType ?? 'VATABLE',
          scDiscountExempt: p.scDiscountExempt ?? false,
        })))
        await setCacheMeta('products')
        setProducts(items)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load products')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(q.toLowerCase()) ||
    (p.barcode ?? '').includes(q)
  )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSearch(value: string) {
    setQ(value)
    setPage(1)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-background flex items-center gap-3">
        <span className="text-foreground font-semibold text-sm">Products</span>
        {filtered.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{filtered.length.toLocaleString()} product{filtered.length !== 1 ? 's' : ''}</span>
        )}
        <input
          value={q}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by name or SKU..."
          aria-label="Search products"
          className="ml-auto bg-card border border-border text-foreground text-xs rounded px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-muted-foreground text-xs">Loading...</div>}
        {error && <ErrorBanner message={error} className="mb-2" />}
        <div className="space-y-1">
          {paginated.map(p => (
            <div key={p.id} className="bg-card rounded px-3 py-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-foreground font-medium">{p.name}</span>
                <span className="text-foreground">₱{Number(p.price).toLocaleString()}</span>
              </div>
              <div className="text-muted-foreground mt-0.5 flex gap-3">
                {p.sku && <span>SKU: {p.sku}</span>}
                {p.stock !== undefined && <span>Stock: {p.stock}</span>}
                {!p.isActive && <span className="text-muted-foreground">Inactive</span>}
              </div>
            </div>
          ))}
          {!loading && !error && filtered.length === 0 && <EmptyState message="No products found." />}
        </div>
      </div>
      <Pagination page={page} totalPages={totalPages} loading={loading} onPageChange={setPage} />
    </div>
  )
}
