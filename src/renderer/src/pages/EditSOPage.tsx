import { useEffect, useRef, useState } from 'react'
import SearchableSelect from '@/components/SearchableSelect'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { db, isCacheExpired, setCacheMeta, invalidateCache } from '@/lib/db'
import type { CachedProduct, CachedCustomer } from '@/lib/db'

interface ApiProduct {
  id: string; name: string; sku?: string; barcode?: string; unit?: string
  price: number | string; stock?: number; categoryId?: string; isActive: boolean; updatedAt: string; vatType?: string
}
interface ApiCustomer {
  id: string; name: string; phone?: string; email?: string
  address?: string; terms?: string; isActive: boolean; updatedAt: string
}
interface ApiEmployee { id: string; name: string }
type DiscountMode = 'PERCENT' | 'AMOUNT'
interface LineItem {
  _key: string; productId: string; productName: string; quantity: number; unitPrice: number
  discount: number; total: number; basePrice: number; vatType: string
}
function calcLineTotal(qty: number, price: number, discount: number, mode: DiscountMode): number {
  if (mode === 'PERCENT') return qty * price * (1 - discount / 100)
  return Math.max(0, qty * price - discount)
}
function fmt(n: number) { return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function EditSOPage() {
  const { id } = useParams<{ id: string }>()
  const [soNumber, setSoNumber] = useState('')
  const [customers, setCustomers] = useState<CachedCustomer[]>([])
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [employees, setEmployees] = useState<ApiEmployee[]>([])
  const [customerId, setCustomerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [orderDate, setOrderDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([])
  const [discountMode, setDiscountMode] = useState<DiscountMode>('PERCENT')
  const [globalDiscount, setGlobalDiscount] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [vatMode, setVatMode] = useState('VAT_EXCLUSIVE')
  const [vatRate, setVatRate] = useState(12)
  const [vatStatus, setVatStatus] = useState('VAT')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const pendingFocusRef = useRef<string | null>(null)

  useEffect(() => {
    if (pendingFocusRef.current) {
      const el = document.getElementById(`product-${pendingFocusRef.current}`)
      if (el) { el.focus(); pendingFocusRef.current = null }
    }
  }, [lines])

  // Fetch business settings for VAT config (discountMode comes from the SO itself)
  useEffect(() => {
    apiFetch('/api/settings/business').then(r => r.ok ? r.json() : null).then(b => {
      if (!b) return
      setVatMode(b.vatMode ?? 'VAT_EXCLUSIVE')
      setVatRate(Number(b.vatRate ?? 12))
      setVatStatus(b.vatStatus ?? 'VAT')
    }).catch(() => {})
  }, [])

  // Recompute line totals when discountMode changes
  useEffect(() => {
    setLines(prev => prev.map(l => ({ ...l, total: calcLineTotal(l.quantity, l.unitPrice, l.discount, discountMode) })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountMode])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    async function load() {
      // Products — fetch from API if cache is expired OR empty
      const pExpired = await isCacheExpired('products', 5 * 60 * 1000)
      const cachedProducts = !pExpired ? await db.products.toArray() : []
      let productList: CachedProduct[]
      if (cachedProducts.length > 0) {
        productList = cachedProducts
      } else {
        const res = await apiFetch('/api/product?limit=500&isActive=true')
        const data = await res.json()
        const items: ApiProduct[] = Array.isArray(data) ? data : (data.data ?? [])
        productList = items.map((p): CachedProduct => ({
          id: p.id, name: p.name, sku: p.sku ?? '', barcode: p.barcode,
          unit: p.unit, price: Number(p.price), stock: p.stock ?? 0,
          categoryId: p.categoryId ?? '', isActive: p.isActive, updatedAt: p.updatedAt,
          vatType: p.vatType ?? 'VATABLE',
        }))
        await db.products.clear()
        await db.products.bulkPut(productList)
        await setCacheMeta('products')
      }
      setProducts(productList)

      // Customers — fetch from API if cache is expired OR empty
      const cExpired = await isCacheExpired('customers', 5 * 60 * 1000)
      const cachedCustomers = !cExpired ? await db.customers.toArray() : []
      if (cachedCustomers.length > 0) {
        setCustomers(cachedCustomers)
      } else {
        const res = await apiFetch('/api/customer?limit=500')
        const data = await res.json()
        const items: ApiCustomer[] = Array.isArray(data) ? data : (data.data ?? [])
        const mapped = items.map((c): CachedCustomer => ({
          id: c.id, name: c.name, phone: c.phone ?? undefined, email: c.email ?? undefined,
          address: c.address ?? undefined, terms: c.terms ?? undefined,
          isActive: c.isActive, updatedAt: c.updatedAt,
        }))
        await db.customers.clear()
        await db.customers.bulkPut(mapped)
        await setCacheMeta('customers')
        setCustomers(mapped)
      }

      // Employees
      const eRes = await apiFetch('/api/employees?limit=200')
      if (eRes.ok) {
        const eData = await eRes.json()
        const emps: ApiEmployee[] = Array.isArray(eData) ? eData : (eData.data ?? [])
        setEmployees(emps.map(e => ({ id: e.id, name: e.name })))
      }

      // Load existing SO
      const soRes = await apiFetch(`/api/sales-orders/${id}`)
      if (!soRes.ok) throw new Error('Failed to load sales order')
      const soData = await soRes.json()
      const so = soData.salesOrder ?? soData

      setSoNumber(so.soNumber ?? '')
      setCustomerId(so.customerId ?? '')
      setEmployeeId(so.employeeId ?? '')
      setOrderDate((so.orderDate ?? so.createdAt ?? '').split('T')[0])
      setNotes(so.notes ?? '')
      const soDiscountMode: DiscountMode = so.discountMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'
      setDiscountMode(soDiscountMode)
      setGlobalDiscount(Number(so.discount ?? 0))
      setDeliveryFee(Number(so.deliveryFee ?? 0))

      const productMap = new Map(productList.map(p => [p.id, p]))
      setLines((so.details ?? []).map((d: any) => {
        const basePrice = productMap.get(d.productId)?.price ?? 0
        const lineDsc = Number(d.discount ?? 0)
        return {
          _key: crypto.randomUUID(),
          productId: d.productId,
          productName: d.product?.name ?? '',
          quantity: Number(d.quantity),
          unitPrice: Number(d.unitPrice),
          discount: lineDsc,
          total: calcLineTotal(Number(d.quantity), Number(d.unitPrice), lineDsc, soDiscountMode),
          basePrice,
          vatType: d.product?.vatType ?? 'VATABLE',
        }
      }))
    }

    load()
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  function addLine(focusAfter = false) {
    const key = crypto.randomUUID()
    if (focusAfter) pendingFocusRef.current = key
    setLines(prev => [...prev, { _key: key, productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, total: 0, basePrice: 0, vatType: 'VATABLE' }])
  }

  function removeLine(i: number) { setLines(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev) }

  function updateLine(i: number, field: keyof Omit<LineItem, '_key'>, value: string | number) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: value }
      if (field === 'productId') {
        const p = products.find(p => p.id === value)
        if (p) {
          updated.productName = p.name; updated.unitPrice = p.price; updated.basePrice = p.price
          updated.vatType = p.vatType ?? 'VATABLE'; updated.discount = 0
          updated.total = calcLineTotal(updated.quantity, p.price, 0, discountMode)
        }
      }
      if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
        updated.total = calcLineTotal(Number(updated.quantity), Number(updated.unitPrice), Number(updated.discount), discountMode)
      }
      return updated
    }))
  }

  async function handleSave(submitAfter = false) {
    if (!customerId) { setError('Please select a customer.'); return }
    const filledLines = lines.filter(l => l.productId)
    if (filledLines.length === 0) { setError('Add at least one line item.'); return }
    if (filledLines.some(l => l.quantity <= 0)) { setError('All quantities must be greater than zero.'); return }
    setSaving(true); setError('')
    try {
      const res = await apiFetch(`/api/sales-orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          customerId,
          employeeId: employeeId || undefined,
          notes: notes.trim() || undefined,
          discount: globalDiscount,
          discountMode,
          deliveryFee: deliveryFee || undefined,
          details: filledLines.map((l, i) => ({
            productId: l.productId, quantity: l.quantity,
            unitPrice: l.unitPrice, discount: l.discount, total: l.total, lineNumber: i + 1,
          })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to update sales order')
      }
      const data = await res.json()
      await invalidateCache('salesOrders')
      if (submitAfter) {
        const soId = data.salesOrder?.id ?? id
        const submitRes = await apiFetch(`/api/sales-orders/${soId}/submit`, { method: 'POST', body: '{}' })
        if (!submitRes.ok) {
          const d = await submitRes.json().catch(() => ({}))
          throw new Error(d.error ?? 'Saved but submit failed')
        }
      }
      navigate('/sales-orders')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update sales order')
    } finally {
      setSaving(false)
    }
  }

  const filledForCalc = lines.filter(l => l.productId)
  const lineSubtotal = filledForCalc.reduce((s, l) => s + l.total, 0)
  const globalDiscountAmt = discountMode === 'AMOUNT' ? globalDiscount : lineSubtotal * (globalDiscount / 100)
  const afterDiscount = lineSubtotal - globalDiscountAmt
  const grandTotal = afterDiscount + deliveryFee

  const showVat = vatStatus === 'VAT'
  const discountRatio = lineSubtotal > 0 ? afterDiscount / lineSubtotal : 1
  const vatableAmt = filledForCalc.filter(l => (l.vatType ?? 'VATABLE') === 'VATABLE').reduce((s, l) => s + l.total, 0) * discountRatio
  const vatExemptAmt = filledForCalc.filter(l => l.vatType === 'VAT_EXEMPT').reduce((s, l) => s + l.total, 0) * discountRatio
  const zeroRatedAmt = filledForCalc.filter(l => l.vatType === 'ZERO_RATED').reduce((s, l) => s + l.total, 0) * discountRatio
  const vatAmt = showVat ? (vatMode === 'VAT_EXCLUSIVE' ? vatableAmt * (vatRate / 100) : vatableAmt * (vatRate / (100 + vatRate))) : 0

  const customerItems = customers.map(c => ({ id: c.id, label: c.name }))
  const employeeItems = employees.map(e => ({ id: e.id, label: e.name }))
  const productItems = products.map(p => ({ id: p.id, label: p.name }))

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/sales-orders')} className="gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <h1 className="text-foreground font-bold text-lg">
            Edit Sales Order {soNumber && <span className="text-muted-foreground font-normal text-base ml-1">— {soNumber}</span>}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Total</div>
          <div className="text-2xl font-bold text-green-400">₱{fmt(grandTotal)}</div>
        </div>
      </div>

      {loading && <div className="text-muted-foreground text-sm">Loading...</div>}
      {error && <div className="bg-destructive/20 text-destructive text-sm p-3 rounded border border-destructive/40">{error}</div>}

      {!loading && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="customer" className="text-foreground text-xs">Customer *</Label>
              <SearchableSelect
                id="customer" value={customerId}
                onChange={(id) => setCustomerId(id)}
                items={customerItems}
                placeholder="Search customer..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Order Date</Label>
              <div className="bg-card border border-border rounded p-2 text-muted-foreground text-sm">
                {orderDate || '—'}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="employee" className="text-foreground text-xs">Sales Agent</Label>
              <SearchableSelect
                id="employee" value={employeeId}
                onChange={(id) => setEmployeeId(id)}
                items={employeeItems}
                placeholder="Search sales agent..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes" className="text-foreground text-xs">Notes</Label>
              <Input
                id="notes" value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="bg-card border-border text-foreground"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-foreground text-sm font-medium">Line Items</span>
              <Button size="sm" variant="outline" onClick={() => addLine(true)} className="gap-1">
                <Plus className="w-3 h-3" /> Add Item
              </Button>
            </div>

            <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground px-2">
              <span className="col-span-4">Product</span>
              <span className="col-span-1 text-center">Qty</span>
              <span className="col-span-2 text-right">Unit Price</span>
              <span className="col-span-2 text-right flex items-center justify-end gap-1">
                Disc
                <button type="button" onClick={() => {
                  const next = discountMode === 'PERCENT' ? 'AMOUNT' : 'PERCENT'
                  setLines(prev => prev.map(l => ({ ...l, discount: 0, total: calcLineTotal(l.quantity, l.unitPrice, 0, next) })))
                  setGlobalDiscount(0)
                  setDiscountMode(next)
                }}
                  className="text-[9px] px-1 py-0.5 rounded bg-muted hover:bg-muted text-foreground leading-none">
                  {discountMode === 'PERCENT' ? '%' : '₱'}
                </button>
              </span>
              <span className="col-span-2 text-right">Total</span>
              <span />
            </div>

            {lines.map((line, i) => (
              <div key={line._key} className="grid grid-cols-12 gap-2 items-center bg-card rounded p-2">
                <div className="col-span-4">
                  <SearchableSelect
                    id={`product-${line._key}`}
                    value={line.productId}
                    onChange={(id) => updateLine(i, 'productId', id)}
                    items={productItems}
                    placeholder="Search product..."
                  />
                </div>
                <Input
                  id={`qty-${line._key}`}
                  type="number" value={line.quantity} min={1}
                  onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault()
                      document.getElementById(`price-${line._key}`)?.focus()
                    }
                  }}
                  className="col-span-1 bg-muted border-0 text-foreground text-xs h-7 text-center"
                />
                <Input
                  id={`price-${line._key}`}
                  type="number" value={line.unitPrice} min={0} step={0.01}
                  onChange={e => updateLine(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  onBlur={e => {
                    if (line.basePrice > 0 && (parseFloat(e.target.value) || 0) < line.basePrice) {
                      updateLine(i, 'unitPrice', line.basePrice)
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault()
                      if (line.basePrice > 0 && line.unitPrice < line.basePrice) updateLine(i, 'unitPrice', line.basePrice)
                      document.getElementById(`disc-${line._key}`)?.focus()
                    }
                  }}
                  className={`col-span-2 bg-muted text-foreground text-xs h-7 text-right ${line.basePrice > 0 && line.unitPrice < line.basePrice ? 'border border-red-500' : 'border-0'}`}
                />
                <Input
                  id={`disc-${line._key}`}
                  type="number" value={line.discount} min={0}
                  step={discountMode === 'PERCENT' ? 1 : 0.01}
                  max={discountMode === 'PERCENT' ? 100 : undefined}
                  onChange={e => updateLine(i, 'discount', parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); addLine(true) }
                  }}
                  className="col-span-2 bg-muted border-0 text-foreground text-xs h-7 text-right"
                />
                <span className="col-span-2 text-foreground text-xs text-right">₱{fmt(line.total)}</span>
                <Button
                  size="sm" variant="ghost" onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                  className="col-span-1 h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20 disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}

            {/* Totals summary */}
            {filledForCalc.length > 0 && (
              <div className="mt-3 border-t border-border pt-3 space-y-1 pr-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span><span>₱{fmt(lineSubtotal)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0">{discountMode === 'AMOUNT' ? 'Discount (₱)' : 'Discount (%)'}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Input type="number" min={0} step={discountMode === 'PERCENT' ? 1 : 0.01}
                      max={discountMode === 'PERCENT' ? 100 : undefined}
                      value={globalDiscount} onChange={e => setGlobalDiscount(parseFloat(e.target.value) || 0)}
                      onFocus={e => e.target.select()}
                      className="w-24 bg-muted border-0 text-foreground text-xs h-6 text-right" />
                    {globalDiscountAmt > 0 && <span className="text-red-400 text-xs w-28 text-right">-₱{fmt(globalDiscountAmt)}</span>}
                  </div>
                </div>
                {globalDiscountAmt > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>After Discount</span><span>₱{fmt(afterDiscount)}</span>
                  </div>
                )}
                {showVat && filledForCalc.length > 0 && (
                  <div className="border-t border-border pt-1 mt-1 space-y-0.5">
                    {vatableAmt > 0 && <div className="flex justify-between text-[11px] text-muted-foreground"><span>Vatable Sales</span><span>₱{fmt(vatMode === 'VAT_INCLUSIVE' ? vatableAmt - vatAmt : vatableAmt)}</span></div>}
                    {vatAmt > 0 && <div className="flex justify-between text-[11px] text-muted-foreground"><span>VAT ({vatRate}%)</span><span>₱{fmt(vatAmt)}</span></div>}
                    {vatExemptAmt > 0 && <div className="flex justify-between text-[11px] text-muted-foreground"><span>VAT Exempt</span><span>₱{fmt(vatExemptAmt)}</span></div>}
                    {zeroRatedAmt > 0 && <div className="flex justify-between text-[11px] text-muted-foreground"><span>Zero Rated</span><span>₱{fmt(zeroRatedAmt)}</span></div>}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0">Delivery Fee</span>
                  <div className="ml-auto">
                    <Input type="number" min={0} step={0.01} value={deliveryFee}
                      onChange={e => setDeliveryFee(parseFloat(e.target.value) || 0)}
                      onFocus={e => e.target.select()}
                      className="w-24 bg-muted border-0 text-foreground text-xs h-6 text-right" />
                  </div>
                </div>
                <div className="flex justify-between text-sm font-bold text-foreground border-t border-border pt-2 mt-1">
                  <span>Grand Total</span><span>₱{fmt(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="text-foreground">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Submit'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
