import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import type { CachedProduct, CachedCustomer } from '@/lib/db'
import type { CartItem } from '@/lib/cart'
import { computeSale, HOLDER_LABELS } from '@/lib/discount'
import DiscountDialog, { type Holder } from '@/components/DiscountDialog'
import { apiFetch } from '@/lib/api'
import ProductGrid from '@/components/ProductGrid'
import CartSidebar from '@/components/CartSidebar'
import CheckoutDialog from '@/components/CheckoutDialog'

export default function SalesPage() {
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [customers, setCustomers] = useState<CachedCustomer[]>([])
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({})
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<CachedCustomer | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showHold, setShowHold] = useState(false)
  const [discount, setDiscount] = useState<Holder | null>(null)
  const [showDiscount, setShowDiscount] = useState(false)
  const [biz, setBiz] = useState<{ businessName: string; address: string; tin: string; vatRegistered: boolean } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const focusSearch = useCallback(() => {
    const el = searchRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  useEffect(() => {
    db.products.toArray().then(setProducts)
    db.customers.filter(c => c.isActive).toArray().then(setCustomers)
    // Live category names (id -> name); falls back to cached categoryName/id if offline
    apiFetch('/api/category?limit=500')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const list: Array<{ id: string; name: string }> = Array.isArray(d) ? d : (d.data ?? [])
        setCategoryNames(Object.fromEntries(list.map(c => [c.id, c.name])))
      })
      .catch(() => { /* offline — fall back to cached categoryName */ })
    // Business info for the customer-facing header
    window.electron.store.get('birConfig')
      .then(v => {
        const b = v as { businessName?: string; address?: string; tin?: string; vatRegistered?: boolean } | undefined
        if (b?.businessName) setBiz({ businessName: b.businessName, address: b.address ?? '', tin: b.tin ?? '', vatRegistered: b.vatRegistered ?? true })
      })
      .catch(() => {})
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F1') { e.preventDefault(); focusSearch() }
      if (e.key === 'F2') { e.preventDefault(); if (cart.length > 0) setShowHold(true) }
      if (e.key === 'F3') { e.preventDefault(); if (cart.length > 0) setShowCheckout(true) }
      if (e.key === 'Escape') { setShowCheckout(false); setShowHold(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cart, showCheckout, showHold, focusSearch])

  const addToCart = useCallback((product: CachedProduct) => {
    if (product.stock === 0) return
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1 }]
    })
  }, [])

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) setCart(prev => prev.filter(i => i.product.id !== productId))
    else setCart(prev => prev.map(i => i.product.id === productId ? { ...i, quantity: qty } : i))
  }, [])

  const removeItem = useCallback((productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId))
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setCustomer(null)
    setDiscount(null)
  }, [])

  const sale = computeSale(
    cart.map(i => ({
      lineTotal: Math.round(i.product.price * i.quantity * 100) / 100,
      vatType: i.product.vatType ?? 'VATABLE',
      scDiscountExempt: i.product.scDiscountExempt ?? false,
    })),
    discount?.holderType ?? null,
  )
  const total = sale.amountDue
  const discountLabel = discount
    ? `${HOLDER_LABELS[discount.holderType]} · ${discount.holderName} · ${discount.holderId}`
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {biz && (
        <header className="shrink-0 flex items-center justify-between px-4 py-1.5 bg-card border-b border-border">
          <span className="text-foreground font-bold text-sm tracking-tight truncate">{biz.businessName}</span>
          <span className="text-muted-foreground text-[10px] text-right truncate ml-3">
            {[biz.address, biz.tin && `${biz.vatRegistered ? 'VAT REG TIN' : 'NON-VAT TIN'}: ${biz.tin}`].filter(Boolean).join('  ·  ')}
          </span>
        </header>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-[3] min-w-0 flex flex-col">
        <ProductGrid
          products={products}
          customers={customers}
          customer={customer}
          cart={cart}
          categoryNames={categoryNames}
          searchRef={searchRef}
          onAddToCart={addToCart}
          onSelectCustomer={setCustomer}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col border-l border-border">
        <CartSidebar
          cart={cart}
          customer={customer}
          total={total}
          discountLabel={discountLabel}
          discountAmount={sale.discount + sale.vatExemptReduction}
          onUpdateQty={updateQty}
          onRemoveItem={removeItem}
          onClear={clearCart}
          onHold={() => setShowHold(true)}
          onCheckout={() => setShowCheckout(true)}
          onOpenDiscount={() => setShowDiscount(true)}
          onRemoveDiscount={() => setDiscount(null)}
        />
      </div>
      </div>

      {showCheckout && (
        <CheckoutDialog
          cart={cart}
          customer={customer}
          total={total}
          sale={sale}
          holder={discount}
          onClose={() => setShowCheckout(false)}
          onSuccess={() => { clearCart(); setShowCheckout(false); setTimeout(focusSearch, 0) }}
        />
      )}

      {showDiscount && (
        <DiscountDialog
          current={discount}
          onApply={(h) => { setDiscount(h); setShowDiscount(false) }}
          onRemove={() => { setDiscount(null); setShowDiscount(false) }}
          onClose={() => setShowDiscount(false)}
        />
      )}

      {showHold && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowHold(false)}>
          <div className="bg-card border border-border rounded-lg p-6 w-80 space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-foreground font-semibold">Hold Order</h2>
            <p className="text-muted-foreground text-sm">Cart has been placed on hold. Recall will be available in a future update.</p>
            <button className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium" onClick={() => setShowHold(false)}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}
