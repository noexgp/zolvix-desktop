# Sales Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full POS sales screen for Zolvix Desktop — product grid, cart sidebar, and checkout dialog with all 6 payment methods.

**Architecture:** `SalesPage` owns all cart/checkout state and passes props down to `ProductGrid`, `CartSidebar`, and `CheckoutDialog`. Products are read from the Dexie.js local cache (already populated by App.tsx background refresh). Checkout calls `POST /api/sales` via `apiFetch`, then prints a thermal receipt.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4, shadcn/ui (`Button`, `Input`, `Dialog`), Dexie.js (`db.products`, `db.customers`), `apiFetch` from `@/lib/api`, `useAppStore` from `@/stores/appStore`, `printThermal` from `@/lib/escp`, `react-router-dom`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/src/lib/cart.ts` | Create | Cart math utilities (line total, grand total, payment remaining) |
| `src/renderer/src/lib/__tests__/cart.test.ts` | Create | Unit tests for cart utilities |
| `src/renderer/src/pages/SalesPage.tsx` | Create | State owner: cart, customer, dialog visibility |
| `src/renderer/src/components/ProductGrid.tsx` | Create | Product browser: search, category tabs, 4-col grid |
| `src/renderer/src/components/CartSidebar.tsx` | Create | Cart display: total banner, item rows, Hold/Checkout footer |
| `src/renderer/src/components/CheckoutDialog.tsx` | Create | Payment dialog: 6 methods, split payment, submit |
| `src/renderer/src/App.tsx` | Modify | Add `/sales` route |
| `src/renderer/src/components/Sidebar.tsx` | Modify | Add POS nav group with Sales link |

---

## Task 1: Cart utility functions (TDD)

**Files:**
- Create: `src/renderer/src/lib/cart.ts`
- Create: `src/renderer/src/lib/__tests__/cart.test.ts`

These pure functions calculate totals and are the foundation for everything else. Test first.

- [ ] **Step 1.1: Write the failing tests**

Create `src/renderer/src/lib/__tests__/cart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { lineTotal, cartTotal, paymentTotal, remaining } from '../cart'

const p = (price: number) => ({ id: '1', name: 'Item', price, stock: 10, sku: '', categoryId: '', isActive: true, updatedAt: '' })

describe('lineTotal', () => {
  it('multiplies price by quantity', () => {
    expect(lineTotal(p(25), 3)).toBe(75)
  })
  it('handles decimal prices', () => {
    expect(lineTotal(p(12.5), 2)).toBe(25)
  })
})

describe('cartTotal', () => {
  it('sums all line totals', () => {
    const items = [
      { product: p(25), quantity: 2 },
      { product: p(75), quantity: 1 },
    ]
    expect(cartTotal(items)).toBe(125)
  })
  it('returns 0 for empty cart', () => {
    expect(cartTotal([])).toBe(0)
  })
})

describe('paymentTotal', () => {
  it('sums payment amounts', () => {
    expect(paymentTotal([{ id: '1', method: 'cash', amount: 100 }, { id: '2', method: 'card', amount: 80 }])).toBe(180)
  })
})

describe('remaining', () => {
  it('returns 0 when fully paid', () => {
    expect(remaining(100, [{ id: '1', method: 'cash', amount: 100 }])).toBe(0)
  })
  it('returns positive when underpaid', () => {
    expect(remaining(150, [{ id: '1', method: 'cash', amount: 100 }])).toBe(50)
  })
  it('never returns negative', () => {
    expect(remaining(100, [{ id: '1', method: 'cash', amount: 200 }])).toBe(0)
  })
})
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd /Users/glenn/dev/zolvix-desktop
npm run test -- cart.test.ts
```
Expected: 7 failures — `lineTotal`, `cartTotal`, `paymentTotal`, `remaining` not found.

- [ ] **Step 1.3: Implement cart utilities**

Create `src/renderer/src/lib/cart.ts`:

```ts
import type { CachedProduct } from '@/lib/db'

export interface CartItem {
  product: CachedProduct
  quantity: number
}

export interface PaymentEntry {
  id: string
  method: 'cash' | 'card' | 'ewallet' | 'check' | 'charge' | 'gc' | null
  amount: number
  cashTendered?: number
  cardProvider?: string
  ewalletProvider?: string
  approvalCode?: string
  referenceNo?: string
  checkNumber?: string
  bankName?: string
  checkDate?: string
  checkPayorName?: string
}

export function lineTotal(product: CachedProduct, quantity: number): number {
  return Math.round(product.price * quantity * 100) / 100
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + lineTotal(item.product, item.quantity), 0)
}

export function paymentTotal(payments: PaymentEntry[]): number {
  return payments.reduce((sum, p) => sum + (p.amount || 0), 0)
}

export function remaining(total: number, payments: PaymentEntry[]): number {
  return Math.max(0, total - paymentTotal(payments))
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
npm run test -- cart.test.ts
```
Expected: 7 passing.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/glenn/dev/zolvix-desktop
git add src/renderer/src/lib/cart.ts src/renderer/src/lib/__tests__/cart.test.ts
git commit -m "feat(sales): add cart utility functions with tests"
```

---

## Task 2: Route + SalesPage skeleton

**Files:**
- Create: `src/renderer/src/pages/SalesPage.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 2.1: Add `/sales` route to App.tsx**

In `src/renderer/src/App.tsx`, add the import at the top with the other page imports:

```ts
import SalesPage from '@/pages/SalesPage'
```

Inside the authenticated `<Route>` group (after the existing routes), add:

```tsx
<Route path="/sales" element={<SalesPage />} />
```

- [ ] **Step 2.2: Add POS nav group to Sidebar.tsx**

In `src/renderer/src/components/Sidebar.tsx`, add `ShoppingCart` to the lucide import:

```ts
import { ClipboardList, FileText, Users, Package, Settings, LogOut, Sun, Moon, ShoppingCart } from 'lucide-react'
```

Add a POS group at the top of the `nav` array (before PIPELINE):

```ts
const nav = [
  { group: 'POS', items: [
    { to: '/sales', icon: ShoppingCart, label: 'Sales' },
  ]},
  { group: 'PIPELINE', items: [
    { to: '/sales-orders', icon: ClipboardList, label: 'Sales Orders' },
    { to: '/invoices',     icon: FileText,      label: 'Invoices' },
  ]},
  { group: 'REFERENCE', items: [
    { to: '/customers', icon: Users,   label: 'Ledger' },
    { to: '/products',  icon: Package, label: 'Products' },
  ]},
]
```

- [ ] **Step 2.3: Create SalesPage.tsx skeleton**

Create `src/renderer/src/pages/SalesPage.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { CachedProduct, CachedCustomer } from '@/lib/db'
import { cartTotal } from '@/lib/cart'
import type { CartItem, PaymentEntry } from '@/lib/cart'
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
  }, [cart])

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
          onSuccess={clearCart}
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
```

- [ ] **Step 2.4: Verify the app builds**

```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:web 2>&1 | grep -v "^>" | head -20
```
Expected: Only the 4 pre-existing errors (vatType, process, EditSOPage, NewSOPage). No new errors.

- [ ] **Step 2.5: Commit**

```bash
git add src/renderer/src/pages/SalesPage.tsx src/renderer/src/App.tsx src/renderer/src/components/Sidebar.tsx
git commit -m "feat(sales): add SalesPage route and sidebar nav entry"
```

---

## Task 3: ProductGrid component

**Files:**
- Create: `src/renderer/src/components/ProductGrid.tsx`

- [ ] **Step 3.1: Create ProductGrid.tsx**

Create `src/renderer/src/components/ProductGrid.tsx`:

```tsx
import { useState, useMemo } from 'react'
import type { CachedProduct, CachedCustomer } from '@/lib/db'
import type { CartItem } from '@/lib/cart'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import SearchableSelect from '@/components/SearchableSelect'

interface Props {
  products: CachedProduct[]
  customers: CachedCustomer[]
  customer: CachedCustomer | null
  cart: CartItem[]
  onAddToCart: (product: CachedProduct) => void
  onSelectCustomer: (customer: CachedCustomer | null) => void
}

export default function ProductGrid({ products, customers, customer, cart, onAddToCart, onSelectCustomer }: Props) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  const categories = useMemo(() => {
    const ids = [...new Set(products.map(p => p.categoryId).filter(Boolean))]
    return ids
  }, [products])

  const cartIds = useMemo(() => new Set(cart.map(i => i.product.id)), [cart])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => {
      if (!p.isActive) return false
      if (categoryId && p.categoryId !== categoryId) return false
      if (q) return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? '').includes(q)
      return true
    })
  }, [products, search, categoryId])

  const customerItems = useMemo(() =>
    customers.map(c => ({ id: c.id, label: c.name })), [customers])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border shrink-0">
        <Input
          placeholder="Search products or scan barcode..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 h-8 text-sm"
        />
        <div className="w-48 shrink-0">
          <SearchableSelect
            value={customer?.id ?? ''}
            onChange={(id, label) => {
              if (!id) { onSelectCustomer(null); return }
              onSelectCustomer(customers.find(c => c.id === id) ?? null)
            }}
            items={[{ id: '', label: 'Walk-in' }, ...customerItems]}
            placeholder="F1 Walk-in"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 px-3 py-1.5 bg-card border-b border-border shrink-0 overflow-x-auto">
        <button
          onClick={() => setCategoryId(null)}
          className={cn(
            'px-3 py-1 rounded text-xs whitespace-nowrap transition-colors',
            categoryId === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-background border border-border text-muted-foreground hover:text-foreground'
          )}
        >
          All
        </button>
        {categories.map(id => (
          <button
            key={id}
            onClick={() => setCategoryId(id === categoryId ? null : id)}
            className={cn(
              'px-3 py-1 rounded text-xs whitespace-nowrap transition-colors',
              categoryId === id
                ? 'bg-primary text-primary-foreground'
                : 'bg-background border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {id}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-4 gap-2 content-start">
        {filtered.map(product => {
          const inCart = cartIds.has(product.id)
          const outOfStock = product.stock === 0
          return (
            <button
              key={product.id}
              onClick={() => onAddToCart(product)}
              disabled={outOfStock}
              className={cn(
                'relative flex flex-col items-center text-center rounded-lg border p-3 transition-all',
                'bg-card hover:bg-accent',
                inCart && !outOfStock ? 'border-primary/50' : 'border-border',
                outOfStock && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="w-full h-12 bg-background rounded mb-2 flex items-center justify-center text-2xl">
                🏷️
              </div>
              <div className="text-xs text-foreground leading-tight mb-1 line-clamp-2">{product.name}</div>
              <div className="text-sm font-bold text-primary">₱{Number(product.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
              {inCart && !outOfStock && (
                <span className="absolute top-1.5 right-1.5 bg-primary/20 text-primary text-[9px] rounded px-1">in cart</span>
              )}
              {outOfStock && (
                <span className="absolute top-1.5 right-1.5 bg-destructive/20 text-destructive text-[9px] rounded px-1">out of stock</span>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-4 text-center text-muted-foreground text-sm py-12">
            No products found
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3.2: Verify build**

```bash
npm run typecheck:web 2>&1 | grep -v "^>" | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: no output (no new errors).

- [ ] **Step 3.3: Commit**

```bash
git add src/renderer/src/components/ProductGrid.tsx
git commit -m "feat(sales): add ProductGrid component with search and category filter"
```

---

## Task 4: CartSidebar component

**Files:**
- Create: `src/renderer/src/components/CartSidebar.tsx`

- [ ] **Step 4.1: Create CartSidebar.tsx**

Create `src/renderer/src/components/CartSidebar.tsx`:

```tsx
import type { CartItem } from '@/lib/cart'
import { lineTotal } from '@/lib/cart'
import type { CachedCustomer } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Minus, Plus, X } from 'lucide-react'

interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  onUpdateQty: (productId: string, qty: number) => void
  onRemoveItem: (productId: string) => void
  onClear: () => void
  onHold: () => void
  onCheckout: () => void
}

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CartSidebar({ cart, customer, total, onUpdateQty, onRemoveItem, onClear, onHold, onCheckout }: Props) {
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)
  const customerName = customer?.name ?? 'Walk-in'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Customer-facing total banner */}
      <div className="shrink-0 bg-gradient-to-br from-blue-700 to-violet-700 px-4 py-4 text-center border-b-2 border-violet-600">
        <p className="text-blue-200 text-[10px] tracking-[0.15em] uppercase mb-0.5">Amount Due</p>
        <p className="text-white text-4xl font-extrabold tracking-tight leading-none">
          ₱{fmt(total)}
        </p>
        <p className="text-blue-300 text-[10px] mt-1">{customerName} · {itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
      </div>

      {/* Cart controls */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-card border-b border-border">
        <span className="text-muted-foreground text-xs">Cart</span>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-destructive text-xs hover:underline">Clear</button>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {cart.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-8">Cart is empty</p>
        )}
        {cart.map(item => (
          <div key={item.product.id} className="bg-background rounded-md p-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-foreground text-xs leading-tight flex-1">{item.product.name}</span>
              <span className="text-primary text-xs font-semibold whitespace-nowrap">
                ₱{fmt(lineTotal(item.product, item.quantity))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-card rounded border border-border">
                <button
                  onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                  className="px-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-foreground text-xs px-2 min-w-[24px] text-center">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                  className="px-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <span className="text-muted-foreground text-[10px]">₱{fmt(item.product.price)} ea</span>
              <button onClick={() => onRemoveItem(item.product.id)} className="ml-auto text-destructive hover:text-destructive/80">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-card border-t border-border p-3">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 text-xs"
            disabled={cart.length === 0}
            onClick={onHold}
          >
            Hold F2
          </Button>
          <Button
            size="sm"
            className="flex-[2] text-sm font-semibold"
            disabled={cart.length === 0}
            onClick={onCheckout}
          >
            Checkout F3 →
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4.2: Verify build**

```bash
npm run typecheck:web 2>&1 | grep -v "^>" | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: no output.

- [ ] **Step 4.3: Commit**

```bash
git add src/renderer/src/components/CartSidebar.tsx
git commit -m "feat(sales): add CartSidebar with total banner and qty controls"
```

---

## Task 5: CheckoutDialog — payment UI

**Files:**
- Create: `src/renderer/src/components/CheckoutDialog.tsx`

- [ ] **Step 5.1: Create CheckoutDialog.tsx**

Create `src/renderer/src/components/CheckoutDialog.tsx`:

```tsx
import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { printThermal } from '@/lib/escp'
import { cn } from '@/lib/utils'
import { cartTotal, paymentTotal, remaining } from '@/lib/cart'
import type { CartItem, PaymentEntry } from '@/lib/cart'
import type { CachedCustomer } from '@/lib/db'

type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'check' | 'charge' | 'gc'

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash',    label: 'Cash' },
  { id: 'card',    label: 'Card' },
  { id: 'ewallet', label: 'E-wallet' },
  { id: 'check',   label: 'Check' },
  { id: 'charge',  label: 'Charge' },
  { id: 'gc',      label: 'GC' },
]

const CARD_PROVIDERS = ['Visa', 'Mastercard', 'Amex', 'JCB', 'UnionPay']
const EWALLET_PROVIDERS = ['GCash', 'Maya', 'ShopeePay', 'Grab Pay']

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  onClose: () => void
  onSuccess: () => void
}

function newPayment(method: PaymentMethod, amount: number): PaymentEntry {
  return { id: nanoid(), method, amount }
}

export default function CheckoutDialog({ cart, customer, total, onClose, onSuccess }: Props) {
  const [payments, setPayments] = useState<PaymentEntry[]>([newPayment('cash', total)])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [change, setChange] = useState<number | null>(null)

  const paid    = paymentTotal(payments)
  const rem     = remaining(total, payments)
  const canPay  = rem === 0 && payments.every(p => p.method !== null)

  function updatePayment(id: string, patch: Partial<PaymentEntry>) {
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function addPayment() {
    setPayments(prev => [...prev, newPayment('cash', rem)])
  }

  function removePayment(id: string) {
    setPayments(prev => prev.filter(p => p.id !== id))
  }

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer?.id,
          cart: cart.map(item => ({
            product: { id: item.product.id, price: item.product.price, name: item.product.name },
            quantity: item.quantity,
            discount: 0,
            orderType: 'TAKE_OUT',
            modifiers: [],
            comboItems: [],
          })),
          payments: payments.map(p => ({
            method: p.method,
            amount: p.amount,
            ...(p.cashTendered !== undefined && { cashTendered: p.cashTendered }),
            ...(p.cardProvider && { cardProvider: p.cardProvider }),
            ...(p.ewalletProvider && { ewalletProvider: p.ewalletProvider }),
            ...(p.approvalCode && { approvalCode: p.approvalCode }),
            ...(p.referenceNo && { referenceNo: p.referenceNo }),
            ...(p.checkNumber && { checkNumber: p.checkNumber }),
            ...(p.bankName && { bankName: p.bankName }),
            ...(p.checkDate && { checkDate: p.checkDate }),
            ...(p.checkPayorName && { checkPayorName: p.checkPayorName }),
          })),
          globalDiscount: 0,
          discountMode: 'PERCENT',
          deliveryFee: 0,
          withholdingTax: 0,
          ewtMode: 'DEDUCT',
          holders: [],
          partySize: 1,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Checkout failed')
      }
      const data = await res.json()

      // Print receipt
      try {
        await printThermal({
          invoiceNumber: data.invoiceNumber ?? data.invoice?.invoiceNumber ?? '',
          totalAmount: total,
          createdAt: data.createdAt ?? new Date().toISOString(),
          customer: customer ? { name: customer.name } : undefined,
          details: cart.map(item => ({
            quantity: item.quantity,
            unitPrice: item.product.price,
            total: item.product.price * item.quantity,
            product: { name: item.product.name },
          })),
        })
      } catch {
        // receipt print failure is non-fatal
      }

      // Show change if cash payment
      const cashPayment = payments.find(p => p.method === 'cash')
      if (cashPayment && (cashPayment.cashTendered ?? cashPayment.amount) > total) {
        setChange((cashPayment.cashTendered ?? cashPayment.amount) - total)
        return
      }

      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (change !== null) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-card border border-border rounded-xl p-8 w-72 text-center space-y-4">
          <p className="text-muted-foreground text-sm">Change</p>
          <p className="text-green-500 text-5xl font-extrabold">₱{fmt(change)}</p>
          <Button className="w-full" onClick={onSuccess}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-foreground font-semibold">Checkout</h2>
            <p className="text-muted-foreground text-xs">{customer?.name ?? 'Walk-in'} · Total ₱{fmt(total)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Payments */}
        <div className="p-5 space-y-4">
          {payments.map((payment, idx) => (
            <div key={payment.id} className="bg-background rounded-lg p-4 space-y-3 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">Payment {idx + 1}</span>
                {payments.length > 1 && (
                  <button onClick={() => removePayment(payment.id)} className="text-destructive text-xs">Remove</button>
                )}
              </div>

              {/* Method selector */}
              <div className="flex gap-1 flex-wrap">
                {METHODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => updatePayment(payment.id, { method: m.id })}
                    className={cn(
                      'px-3 py-1 rounded text-xs transition-colors',
                      payment.method === m.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payment.amount || ''}
                  onChange={e => updatePayment(payment.id, { amount: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-sm"
                />
              </div>

              {/* Cash: tendered */}
              {payment.method === 'cash' && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Cash Tendered (optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={String(payment.amount)}
                    value={payment.cashTendered ?? ''}
                    onChange={e => updatePayment(payment.id, { cashTendered: parseFloat(e.target.value) || undefined })}
                    className="h-8 text-sm"
                  />
                  {(payment.cashTendered ?? payment.amount) > payment.amount && (
                    <p className="text-green-500 text-xs">Change: ₱{fmt((payment.cashTendered ?? payment.amount) - payment.amount)}</p>
                  )}
                </div>
              )}

              {/* Card */}
              {payment.method === 'card' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Provider</Label>
                    <select
                      value={payment.cardProvider ?? ''}
                      onChange={e => updatePayment(payment.id, { cardProvider: e.target.value })}
                      className="w-full bg-card border border-border rounded text-foreground text-xs h-8 px-2"
                    >
                      <option value="">Select...</option>
                      {CARD_PROVIDERS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Approval Code</Label>
                    <Input value={payment.approvalCode ?? ''} onChange={e => updatePayment(payment.id, { approvalCode: e.target.value })} className="h-8 text-xs" />
                  </div>
                </div>
              )}

              {/* E-wallet */}
              {payment.method === 'ewallet' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Provider</Label>
                    <select
                      value={payment.ewalletProvider ?? ''}
                      onChange={e => updatePayment(payment.id, { ewalletProvider: e.target.value })}
                      className="w-full bg-card border border-border rounded text-foreground text-xs h-8 px-2"
                    >
                      <option value="">Select...</option>
                      {EWALLET_PROVIDERS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Reference No.</Label>
                    <Input value={payment.referenceNo ?? ''} onChange={e => updatePayment(payment.id, { referenceNo: e.target.value })} className="h-8 text-xs" />
                  </div>
                </div>
              )}

              {/* Check */}
              {payment.method === 'check' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Check No.</Label>
                    <Input value={payment.checkNumber ?? ''} onChange={e => updatePayment(payment.id, { checkNumber: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Bank</Label>
                    <Input value={payment.bankName ?? ''} onChange={e => updatePayment(payment.id, { bankName: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Date</Label>
                    <Input type="date" value={payment.checkDate ?? ''} onChange={e => updatePayment(payment.id, { checkDate: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Payor Name</Label>
                    <Input value={payment.checkPayorName ?? ''} onChange={e => updatePayment(payment.id, { checkPayorName: e.target.value })} className="h-8 text-xs" />
                  </div>
                </div>
              )}

              {/* GC */}
              {payment.method === 'gc' && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Certificate Code</Label>
                  <Input value={payment.referenceNo ?? ''} onChange={e => updatePayment(payment.id, { referenceNo: e.target.value })} className="h-8 text-xs" />
                </div>
              )}
            </div>
          ))}

          {/* Add payment */}
          <button
            onClick={addPayment}
            className="w-full border border-dashed border-primary/40 text-primary text-xs rounded-lg py-2 hover:bg-primary/5 flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add Payment
          </button>

          {/* Summary */}
          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="text-foreground">₱{fmt(total)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-foreground">₱{fmt(paid)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-muted-foreground">Remaining</span>
              <span className={rem > 0 ? 'text-destructive' : 'text-green-500'}>₱{fmt(rem)}</span>
            </div>
          </div>

          {error && <p className="text-destructive text-xs bg-destructive/10 rounded p-2">{error}</p>}

          <Button
            className="w-full font-semibold"
            disabled={!canPay || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Processing...' : `Confirm Payment ₱${fmt(total)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5.2: Install nanoid if not present**

```bash
cd /Users/glenn/dev/zolvix-desktop
node -e "require('nanoid')" 2>/dev/null && echo "already installed" || npm install nanoid
```

- [ ] **Step 5.3: Verify build**

```bash
npm run typecheck:web 2>&1 | grep -v "^>" | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: no output.

- [ ] **Step 5.4: Commit**

```bash
git add src/renderer/src/components/CheckoutDialog.tsx
git commit -m "feat(sales): add CheckoutDialog with 6 payment methods and split payment"
```

---

## Task 6: Full typecheck + smoke test

**Files:** none (verification only)

- [ ] **Step 6.1: Run full typecheck**

```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: no output.

- [ ] **Step 6.2: Run all tests**

```bash
npm run test 2>&1 | tail -10
```
Expected: all tests pass including the new cart.test.ts.

- [ ] **Step 6.3: Start the dev app and verify Sales screen appears**

```bash
npm run dev
```
- Open the app
- Confirm "Sales" appears in the sidebar under a POS group
- Navigate to Sales — product grid loads from cache, cart sidebar shows with total banner
- Click a product — it appears in cart, total updates
- Click Checkout — dialog opens with Cash pre-selected
- Escape closes the dialog

- [ ] **Step 6.4: Final commit**

```bash
git add -A
git commit -m "feat(sales): complete POS sales screen v1"
```
