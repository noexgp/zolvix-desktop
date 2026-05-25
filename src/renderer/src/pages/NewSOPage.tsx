// src/renderer/src/pages/NewSOPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { db, isCacheExpired, setCacheMeta, invalidateCache } from '@/lib/db'
import type { CachedProduct, CachedCustomer } from '@/lib/db'

interface LineItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

export default function NewSOPage() {
  const [customers, setCustomers] = useState<CachedCustomer[]>([])
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [customerId, setCustomerId] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function loadRefData() {
      // Products
      const pExpired = await isCacheExpired('products', 5 * 60 * 1000)
      if (!pExpired) {
        setProducts(await db.products.toArray())
      } else {
        const res = await apiFetch('/api/products?limit=500&isActive=true')
        if (res.ok) {
          const data = await res.json()
          const items: any[] = data.products ?? data
          const mapped = items.map((p: any): CachedProduct => ({
            id: p.id, name: p.name, sku: p.sku ?? '',
            barcode: p.barcode, unit: p.unit,
            price: Number(p.price), stock: p.stock ?? 0,
            categoryId: p.categoryId ?? '', isActive: p.isActive, updatedAt: p.updatedAt,
          }))
          await db.products.clear()
          await db.products.bulkPut(mapped)
          await setCacheMeta('products')
          setProducts(mapped)
        }
      }
      // Customers
      const cExpired = await isCacheExpired('customers', 5 * 60 * 1000)
      if (!cExpired) {
        setCustomers(await db.customers.toArray())
      } else {
        const res = await apiFetch('/api/customer?limit=500&isActive=true')
        if (res.ok) {
          const data = await res.json()
          const items: any[] = data.customers ?? data
          const mapped = items.map((c: any): CachedCustomer => ({
            id: c.id, name: c.name, phone: c.phone ?? undefined, email: c.email ?? undefined,
            address: c.address ?? undefined, terms: c.terms ?? undefined,
            isActive: c.isActive, updatedAt: c.updatedAt,
          }))
          await db.customers.clear()
          await db.customers.bulkPut(mapped)
          await setCacheMeta('customers')
          setCustomers(mapped)
        }
      }
    }
    loadRefData()
  }, [])

  function addLine() {
    setLines(prev => [...prev, { productId: '', productName: '', quantity: 1, unitPrice: 0, total: 0 }])
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateLine(i: number, field: keyof LineItem, value: string | number) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: value }
      if (field === 'productId') {
        const p = products.find(p => p.id === value)
        if (p) {
          updated.productName = p.name
          updated.unitPrice = p.price
          updated.total = p.price * updated.quantity
        }
      }
      if (field === 'quantity' || field === 'unitPrice') {
        updated.total = Number(updated.unitPrice) * Number(updated.quantity)
      }
      return updated
    }))
  }

  async function handleSave(submitAfter = false) {
    if (!customerId) { setError('Please select a customer.'); return }
    if (lines.length === 0) { setError('Add at least one line item.'); return }
    if (lines.some(l => !l.productId)) { setError('All line items need a product selected.'); return }
    if (lines.some(l => l.quantity <= 0)) { setError('All quantities must be greater than zero.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch('/api/sales-orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          orderDate,
          notes: notes.trim() || undefined,
          details: lines.map((l, i) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.total,
            lineNumber: i + 1,
          })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to create sales order')
      }
      const data = await res.json()
      await invalidateCache('salesOrders')
      if (submitAfter) {
        const soId = data.salesOrder?.id ?? data.id
        await apiFetch(`/api/sales-orders/${soId}/submit`, { method: 'POST', body: '{}' })
      }
      navigate('/sales-orders')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create sales order')
    } finally {
      setSaving(false)
    }
  }

  const grandTotal = lines.reduce((s, l) => s + l.total, 0)

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/sales-orders')} className="gap-1 text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <h1 className="text-white font-bold text-lg">New Sales Order</h1>
      </div>

      {error && <div className="bg-red-900/40 text-red-400 text-sm p-3 rounded border border-red-800">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="customer" className="text-slate-300 text-xs">Customer *</Label>
          <select
            id="customer"
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select customer...</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="order-date" className="text-slate-300 text-xs">Order Date *</Label>
          <Input
            id="order-date"
            type="date"
            value={orderDate}
            onChange={e => setOrderDate(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes" className="text-slate-300 text-xs">Notes</Label>
        <textarea
          id="notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes..."
          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 text-sm font-medium">Line Items</span>
          <Button size="sm" variant="outline" onClick={addLine} className="gap-1 text-xs h-7">
            <Plus className="w-3 h-3" /> Add Item
          </Button>
        </div>

        {lines.length === 0 && (
          <div className="text-slate-600 text-xs py-4 text-center border border-dashed border-slate-700 rounded">
            No line items yet — click "Add Item" to begin
          </div>
        )}

        {/* Column headers */}
        {lines.length > 0 && (
          <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-500 px-2">
            <span className="col-span-5">Product</span>
            <span className="col-span-2 text-center">Qty</span>
            <span className="col-span-2 text-right">Unit Price</span>
            <span className="col-span-2 text-right">Total</span>
            <span></span>
          </div>
        )}

        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-800 rounded p-2">
            <select
              value={line.productId}
              onChange={e => updateLine(i, 'productId', e.target.value)}
              className="col-span-5 bg-slate-700 border-0 text-white text-xs rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Input
              type="number"
              value={line.quantity}
              min={1}
              onChange={e => updateLine(i, 'quantity', Math.max(1, Number(e.target.value)))}
              className="col-span-2 bg-slate-700 border-0 text-white text-xs h-7 text-center"
            />
            <Input
              type="number"
              value={line.unitPrice}
              min={0}
              step={0.01}
              onChange={e => updateLine(i, 'unitPrice', Number(e.target.value))}
              className="col-span-2 bg-slate-700 border-0 text-white text-xs h-7 text-right"
            />
            <span className="col-span-2 text-white text-xs text-right">₱{line.total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeLine(i)}
              className="col-span-1 h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}

        {lines.length > 0 && (
          <div className="text-right text-sm font-bold text-white pr-10">
            Grand Total: ₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-slate-800">
        <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="text-slate-300">
          {saving ? 'Saving...' : 'Save as Draft'}
        </Button>
        <Button onClick={() => handleSave(true)} disabled={saving}>
          {saving ? 'Saving...' : 'Save & Submit'}
        </Button>
      </div>
    </div>
  )
}
