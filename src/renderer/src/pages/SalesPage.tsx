import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { CachedProduct, CachedCustomer } from '@/lib/db'
import { cartTotal } from '@/lib/cart'
import type { CartItem } from '@/lib/cart'
import ProductGrid from '@/components/ProductGrid'
import CartSidebar from '@/components/CartSidebar'
import CheckoutDialog from '@/components/CheckoutDialog'

export default function SalesPage() {
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [customers, setCustomers] = useState<CachedCustomer[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<CachedCustomer | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showHold, setShowHold] = useState(false)

  useEffect(() => {
    db.products.toArray().then(setProducts)
    db.customers.filter(c => c.isActive).toArray().then(setCustomers)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F1') { e.preventDefault(); setCustomer(null) }
      if (e.key === 'F2') { e.preventDefault(); if (cart.length > 0) setShowHold(true) }
      if (e.key === 'F3') { e.preventDefault(); if (cart.length > 0) setShowCheckout(true) }
      if (e.key === 'Escape') { setShowCheckout(false); setShowHold(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cart, showCheckout, showHold])

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
  }, [])

  const total = cartTotal(cart)

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-[3] min-w-0 flex flex-col">
        <ProductGrid
          products={products}
          customers={customers}
          customer={customer}
          cart={cart}
          onAddToCart={addToCart}
          onSelectCustomer={setCustomer}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col border-l border-border">
        <CartSidebar
          cart={cart}
          customer={customer}
          total={total}
          onUpdateQty={updateQty}
          onRemoveItem={removeItem}
          onClear={clearCart}
          onHold={() => setShowHold(true)}
          onCheckout={() => setShowCheckout(true)}
        />
      </div>

      {showCheckout && (
        <CheckoutDialog
          cart={cart}
          customer={customer}
          total={total}
          onClose={() => setShowCheckout(false)}
          onSuccess={() => { clearCart(); setShowCheckout(false) }}
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
