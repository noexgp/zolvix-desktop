// src/renderer/src/pages/ProductsPage.tsx
import { useEffect, useState } from 'react'
import { db, isCacheExpired, setCacheMeta } from '@/lib/db'
import { apiFetch } from '@/lib/api'

interface ApiProduct {
  id: string; name: string; sku?: string; barcode?: string; unit?: string
  price: number | string; stock?: number; categoryId?: string; isActive: boolean; updatedAt: string
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [q, setQ] = useState('')
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
        const res = await apiFetch('/api/products?limit=500&isActive=true')
        if (!res.ok) throw new Error('Failed to load products')
        const data = await res.json()
        const items: ApiProduct[] = Array.isArray(data) ? data : (data.products ?? [])
        await db.products.clear()
        await db.products.bulkPut(items.map(p => ({
          id: p.id, name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '', unit: p.unit ?? '',
          price: Number(p.price), stock: p.stock ?? 0, categoryId: p.categoryId ?? '',
          isActive: p.isActive, updatedAt: p.updatedAt,
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

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-900 flex items-center gap-3">
        <span className="text-white font-semibold text-sm">Products</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name or SKU..."
          aria-label="Search products"
          className="ml-auto bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-slate-500 text-xs">Loading...</div>}
        {error && <div className="text-red-400 text-xs bg-red-900/20 p-2 rounded mb-2">{error}</div>}
        <div className="space-y-1">
          {filtered.map(p => (
            <div key={p.id} className="bg-slate-800 rounded px-3 py-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">{p.name}</span>
                <span className="text-white">₱{Number(p.price).toLocaleString()}</span>
              </div>
              <div className="text-slate-400 mt-0.5 flex gap-3">
                {p.sku && <span>SKU: {p.sku}</span>}
                {p.stock !== undefined && <span>Stock: {p.stock}</span>}
                {!p.isActive && <span className="text-slate-500">Inactive</span>}
              </div>
            </div>
          ))}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-slate-500 text-xs">No products found.</div>
          )}
        </div>
      </div>
    </div>
  )
}
