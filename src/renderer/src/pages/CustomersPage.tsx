// src/renderer/src/pages/CustomersPage.tsx
import { useEffect, useState } from 'react'
import { db, isCacheExpired, setCacheMeta } from '@/lib/db'
import { apiFetch } from '@/lib/api'

interface ApiCustomer {
  id: string; name: string; phone?: string; email?: string
  address?: string; terms?: number; isActive: boolean; updatedAt: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<ApiCustomer[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    async function load() {
      try {
        const expired = await isCacheExpired('customers', 5 * 60 * 1000)
        if (!expired) {
          setCustomers(await db.customers.toArray() as unknown as ApiCustomer[])
          return
        }
        const res = await apiFetch('/api/customer?limit=500')
        if (!res.ok) throw new Error('Failed to load customers')
        const data = await res.json()
        const items: ApiCustomer[] = Array.isArray(data) ? data : (data.customers ?? [])
        await db.customers.clear()
        await db.customers.bulkPut(items.map(c => ({
          id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '',
          address: c.address ?? '', terms: c.terms, isActive: c.isActive, updatedAt: c.updatedAt,
        })))
        await setCacheMeta('customers')
        setCustomers(items)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customers')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.phone ?? '').includes(q) ||
    (c.email ?? '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-900 flex items-center gap-3">
        <span className="text-white font-semibold text-sm">Customers</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search..."
          aria-label="Search customers"
          className="ml-auto bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-slate-500 text-xs">Loading...</div>}
        {error && <div className="text-red-400 text-xs bg-red-900/20 p-2 rounded mb-2">{error}</div>}
        <div className="space-y-1">
          {filtered.map(c => (
            <div key={c.id} className="bg-slate-800 rounded px-3 py-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">{c.name}</span>
                {!c.isActive && <span className="text-slate-500 text-[10px]">Inactive</span>}
              </div>
              {(c.phone || c.email) && (
                <div className="text-slate-400 mt-0.5">
                  {c.phone && <span>{c.phone}</span>}
                  {c.phone && c.email && <span className="mx-1">·</span>}
                  {c.email && <span>{c.email}</span>}
                </div>
              )}
            </div>
          ))}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-slate-500 text-xs">No customers found.</div>
          )}
        </div>
      </div>
    </div>
  )
}
