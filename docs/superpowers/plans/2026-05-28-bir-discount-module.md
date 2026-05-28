# BIR Discount Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-holder BIR privileged discounting (Senior Citizen, PWD, Solo Parent) to the desktop POS, with accurate per-item VAT classification, shown live in the cart and printed on the receipt.

**Architecture:** A pure `computeSale(items, holderType)` in `lib/discount.ts` does all VAT + discount math. `SalesPage` owns the holder selection state, computes the sale, and passes the discounted `amountDue` + breakdown down to `CartSidebar`, `CheckoutDialog`, and the receipt. `CheckoutDialog` adds `holders` + `partySize:1` to the `/api/sales` payload (already supported server-side).

**Tech Stack:** React 18, TypeScript, Tailwind 4, shadcn/ui, Dexie.js, Vitest, `apiFetch`, `react-thermal-printer` (main process).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/src/lib/discount.ts` | Create | VAT classification + SC/PWD/SP discount math |
| `src/renderer/src/lib/__tests__/discount.test.ts` | Create | Unit tests |
| `src/renderer/src/lib/db.ts` | Modify | Add `scDiscountExempt` to `CachedProduct` |
| `src/renderer/src/App.tsx` | Modify | Cache `scDiscountExempt` |
| `src/renderer/src/pages/ProductsPage.tsx` | Modify | Cache `vatType` + `scDiscountExempt` |
| `src/renderer/src/components/DiscountDialog.tsx` | Create | Holder type + name/ID picker |
| `src/renderer/src/components/CartSidebar.tsx` | Modify | Discount button + active chip |
| `src/renderer/src/pages/SalesPage.tsx` | Modify | Holder state, compute sale, pass down |
| `src/renderer/src/components/CheckoutDialog.tsx` | Modify | holders/partySize in payload; pass vat/discount/holder to receipt |
| `src/electron-main/escp-thermal.tsx` | Modify | Real VAT breakdown, discount line, holder block |

---

## Task 1: Discount + VAT math (TDD)

**Files:**
- Create: `src/renderer/src/lib/discount.ts`
- Create: `src/renderer/src/lib/__tests__/discount.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `src/renderer/src/lib/__tests__/discount.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeSale } from '../discount'
import type { DiscountItem } from '../discount'

const vatable = (lineTotal: number, scDiscountExempt = false): DiscountItem => ({ lineTotal, vatType: 'VATABLE', scDiscountExempt })
const exempt  = (lineTotal: number): DiscountItem => ({ lineTotal, vatType: 'EXEMPT', scDiscountExempt: false })
const zero    = (lineTotal: number): DiscountItem => ({ lineTotal, vatType: 'ZERO_RATED', scDiscountExempt: false })

describe('computeSale — no holder', () => {
  it('splits a VATABLE cart into net sales + VAT', () => {
    const r = computeSale([vatable(112)], null)
    expect(r.vat.vatableSales).toBeCloseTo(100, 2)
    expect(r.vat.vatAmount).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(112, 2)
    expect(r.discount).toBe(0)
  })
  it('classifies EXEMPT and ZERO_RATED separately', () => {
    const r = computeSale([vatable(112), exempt(50), zero(30)], null)
    expect(r.vat.vatableSales).toBeCloseTo(100, 2)
    expect(r.vat.vatAmount).toBeCloseTo(12, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(50, 2)
    expect(r.vat.zeroRatedSales).toBeCloseTo(30, 2)
    expect(r.amountDue).toBeCloseTo(192, 2)
  })
})

describe('computeSale — SC/PWD', () => {
  it('removes VAT and gives 20% off the net base', () => {
    const r = computeSale([vatable(112)], 'SC')
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.amountDue).toBeCloseTo(80, 2)
    expect(r.vat.vatableSales).toBeCloseTo(0, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(100, 2)
  })
  it('excludes scDiscountExempt items from the eligible base', () => {
    const r = computeSale([vatable(112), vatable(50, true)], 'PWD')
    expect(r.discount).toBeCloseTo(20, 2)         // only the 112 line is eligible
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(130, 2)       // 162 - 12 - 20
  })
  it('does not discount an EXEMPT item', () => {
    const r = computeSale([exempt(112)], 'SC')
    expect(r.discount).toBe(0)
    expect(r.amountDue).toBeCloseTo(112, 2)
  })
})

describe('computeSale — Solo Parent', () => {
  it('gives 10% off gross with no VAT exemption', () => {
    const r = computeSale([vatable(200)], 'SOLO_PARENT')
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.vatExemptReduction).toBe(0)
    expect(r.amountDue).toBeCloseTo(180, 2)
    expect(r.vat.vatableSales).toBeCloseTo(178.57, 2) // unchanged 200/1.12
  })
})
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd /Users/glenn/dev/zolvix-desktop
npm run test -- discount.test.ts
```
Expected: failures — `computeSale` not found.

- [ ] **Step 1.3: Implement `lib/discount.ts`**

Create `src/renderer/src/lib/discount.ts`:

```ts
export type HolderType = 'SC' | 'PWD' | 'SOLO_PARENT'

export interface DiscountItem {
  lineTotal: number          // unit price × qty (VAT-inclusive)
  vatType: string            // VATABLE | EXEMPT | ZERO_RATED
  scDiscountExempt: boolean
}

export interface VatBreakdown {
  vatableSales: number
  vatAmount: number
  vatExemptSales: number
  zeroRatedSales: number
}

export interface SaleCalc {
  grossSubtotal: number
  discount: number
  vatExemptReduction: number
  amountDue: number
  vat: VatBreakdown
}

const VAT_DIVISOR = 1.12
const r2 = (n: number) => Math.round(n * 100) / 100

export function computeSale(items: DiscountItem[], holderType: HolderType | null): SaleCalc {
  let vatableSales = 0
  let vatAmount = 0
  let vatExemptSales = 0
  let zeroRatedSales = 0
  let gross = 0

  for (const it of items) {
    gross += it.lineTotal
    if (it.vatType === 'EXEMPT') {
      vatExemptSales += it.lineTotal
    } else if (it.vatType === 'ZERO_RATED') {
      zeroRatedSales += it.lineTotal
    } else {
      const net = it.lineTotal / VAT_DIVISOR
      vatableSales += net
      vatAmount += it.lineTotal - net
    }
  }

  let discount = 0
  let vatExemptReduction = 0

  if (holderType === 'SC' || holderType === 'PWD') {
    const eligibleBase = items
      .filter(i => i.vatType !== 'EXEMPT' && i.vatType !== 'ZERO_RATED' && !i.scDiscountExempt)
      .reduce((s, i) => s + i.lineTotal, 0)
    const netBase = eligibleBase / VAT_DIVISOR
    vatExemptReduction = eligibleBase - netBase
    discount = netBase * 0.20
    // The eligible VATABLE portion becomes VAT-exempt on the receipt
    vatableSales -= netBase
    vatAmount -= vatExemptReduction
    vatExemptSales += netBase
  } else if (holderType === 'SOLO_PARENT') {
    const eligibleGross = items.filter(i => !i.scDiscountExempt).reduce((s, i) => s + i.lineTotal, 0)
    discount = eligibleGross * 0.10
  }

  return {
    grossSubtotal: r2(gross),
    discount: r2(discount),
    vatExemptReduction: r2(vatExemptReduction),
    amountDue: r2(gross - vatExemptReduction - discount),
    vat: {
      vatableSales: r2(Math.max(0, vatableSales)),
      vatAmount: r2(Math.max(0, vatAmount)),
      vatExemptSales: r2(Math.max(0, vatExemptSales)),
      zeroRatedSales: r2(Math.max(0, zeroRatedSales)),
    },
  }
}

export const HOLDER_LABELS: Record<HolderType, string> = {
  SC: 'Senior Citizen',
  PWD: 'PWD',
  SOLO_PARENT: 'Solo Parent',
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
npm run test -- discount.test.ts
```
Expected: all passing.

- [ ] **Step 1.5: Commit**

```bash
git add src/renderer/src/lib/discount.ts src/renderer/src/lib/__tests__/discount.test.ts
git commit -m "feat(discount): add BIR VAT + privileged discount math with tests"
```

---

## Task 2: Cache `vatType` + `scDiscountExempt`

**Files:**
- Modify: `src/renderer/src/lib/db.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/pages/ProductsPage.tsx`

- [ ] **Step 2.1: Add `scDiscountExempt` to `CachedProduct`**

In `src/renderer/src/lib/db.ts`, the `CachedProduct` interface ends with:
```ts
  isActive: boolean
  updatedAt: string
  vatType?: string
}
```
Change to:
```ts
  isActive: boolean
  updatedAt: string
  vatType?: string
  scDiscountExempt?: boolean
}
```

- [ ] **Step 2.2: Cache `scDiscountExempt` in App.tsx background refresh**

In `src/renderer/src/App.tsx`, find the products `bulkPut` mapping (it already sets `vatType`). The item type and mapping currently read:
```ts
            const items: Array<{ id: string; name: string; sku?: string; barcode?: string; unit?: string; price: number | string; stock?: number; categoryId?: string; categoryName?: string; category?: { name?: string }; isActive: boolean; updatedAt: string; vatType?: string }> = Array.isArray(data) ? data : (data.products ?? data.data ?? [])
            await db.products.clear()
            await db.products.bulkPut(items.map(p => ({
              id: p.id, name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '', unit: p.unit ?? '',
              price: Number(p.price), stock: p.stock ?? 0,
              categoryId: p.categoryId ?? '', categoryName: p.categoryName ?? p.category?.name ?? '',
              isActive: p.isActive, updatedAt: p.updatedAt,
              vatType: p.vatType ?? 'VATABLE',
            })))
```
Add `scDiscountExempt` to the item type and the mapping:
```ts
            const items: Array<{ id: string; name: string; sku?: string; barcode?: string; unit?: string; price: number | string; stock?: number; categoryId?: string; categoryName?: string; category?: { name?: string }; isActive: boolean; updatedAt: string; vatType?: string; scDiscountExempt?: boolean }> = Array.isArray(data) ? data : (data.products ?? data.data ?? [])
            await db.products.clear()
            await db.products.bulkPut(items.map(p => ({
              id: p.id, name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '', unit: p.unit ?? '',
              price: Number(p.price), stock: p.stock ?? 0,
              categoryId: p.categoryId ?? '', categoryName: p.categoryName ?? p.category?.name ?? '',
              isActive: p.isActive, updatedAt: p.updatedAt,
              vatType: p.vatType ?? 'VATABLE',
              scDiscountExempt: p.scDiscountExempt ?? false,
            })))
```

- [ ] **Step 2.3: Cache `vatType` + `scDiscountExempt` in ProductsPage**

In `src/renderer/src/pages/ProductsPage.tsx`, the `ApiProduct` interface is:
```ts
interface ApiProduct {
  id: string; name: string; sku?: string; barcode?: string; unit?: string
  price: number | string; stock?: number; categoryId?: string; categoryName?: string
  category?: { name?: string }; isActive: boolean; updatedAt: string
}
```
Change to add the two fields:
```ts
interface ApiProduct {
  id: string; name: string; sku?: string; barcode?: string; unit?: string
  price: number | string; stock?: number; categoryId?: string; categoryName?: string
  category?: { name?: string }; isActive: boolean; updatedAt: string
  vatType?: string; scDiscountExempt?: boolean
}
```
The `bulkPut` mapping currently reads:
```ts
        await db.products.bulkPut(items.map(p => ({
          id: p.id, name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '', unit: p.unit ?? '',
          price: Number(p.price), stock: p.stock ?? 0, categoryId: p.categoryId ?? '',
          categoryName: p.categoryName ?? p.category?.name ?? '',
          isActive: p.isActive, updatedAt: p.updatedAt,
        })))
```
Change to:
```ts
        await db.products.bulkPut(items.map(p => ({
          id: p.id, name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '', unit: p.unit ?? '',
          price: Number(p.price), stock: p.stock ?? 0, categoryId: p.categoryId ?? '',
          categoryName: p.categoryName ?? p.category?.name ?? '',
          isActive: p.isActive, updatedAt: p.updatedAt,
          vatType: p.vatType ?? 'VATABLE',
          scDiscountExempt: p.scDiscountExempt ?? false,
        })))
```

- [ ] **Step 2.4: Verify build**

```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:web 2>&1 | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: no output.

- [ ] **Step 2.5: Commit**

```bash
git add src/renderer/src/lib/db.ts src/renderer/src/App.tsx src/renderer/src/pages/ProductsPage.tsx
git commit -m "feat(discount): cache vatType and scDiscountExempt on products"
```

---

## Task 3: DiscountDialog component

**Files:**
- Create: `src/renderer/src/components/DiscountDialog.tsx`

- [ ] **Step 3.1: Create the component**

Create `src/renderer/src/components/DiscountDialog.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HolderType } from '@/lib/discount'
import { HOLDER_LABELS } from '@/lib/discount'

export interface Holder {
  holderType: HolderType
  holderName: string
  holderId: string
}

interface Props {
  current: Holder | null
  onApply: (h: Holder) => void
  onRemove: () => void
  onClose: () => void
}

const TYPES: HolderType[] = ['SC', 'PWD', 'SOLO_PARENT']

export default function DiscountDialog({ current, onApply, onRemove, onClose }: Props) {
  const [type, setType] = useState<HolderType>(current?.holderType ?? 'SC')
  const [name, setName] = useState(current?.holderName ?? '')
  const [id, setId] = useState(current?.holderId ?? '')

  const canApply = name.trim().length > 0 && id.trim().length > 0

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-96 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-foreground font-semibold">Privileged Discount</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-1.5">
            {TYPES.map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'rounded-lg py-2 text-xs font-medium border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  type === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {HOLDER_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Holder Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">ID No. (OSCA / PWD / Solo Parent)</Label>
            <Input value={id} onChange={e => setId(e.target.value)} className="h-9 text-sm" />
          </div>

          <div className="flex gap-2 pt-1">
            {current && (
              <Button variant="secondary" className="flex-1" onClick={onRemove}>Remove</Button>
            )}
            <Button
              className="flex-[2]"
              disabled={!canApply}
              onClick={() => onApply({ holderType: type, holderName: name.trim(), holderId: id.trim() })}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3.2: Verify build**

```bash
npm run typecheck:web 2>&1 | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: no output.

- [ ] **Step 3.3: Commit**

```bash
git add src/renderer/src/components/DiscountDialog.tsx
git commit -m "feat(discount): add DiscountDialog holder picker"
```

---

## Task 4: CartSidebar discount control

**Files:**
- Modify: `src/renderer/src/components/CartSidebar.tsx`

- [ ] **Step 4.1: Add discount props and UI**

In `src/renderer/src/components/CartSidebar.tsx`, the import line is:
```ts
import { Minus, Plus, X, ShoppingCart, Trash2, Pause, ArrowRight } from 'lucide-react'
```
Change to add `Tag`:
```ts
import { Minus, Plus, X, ShoppingCart, Trash2, Pause, ArrowRight, Tag } from 'lucide-react'
```

The `Props` interface currently is:
```ts
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
```
Change to add discount props:
```ts
interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  discountLabel: string | null
  discountAmount: number
  onUpdateQty: (productId: string, qty: number) => void
  onRemoveItem: (productId: string) => void
  onClear: () => void
  onHold: () => void
  onCheckout: () => void
  onOpenDiscount: () => void
  onRemoveDiscount: () => void
}
```
Update the component signature:
```ts
export default function CartSidebar({ cart, customer, total, discountLabel, discountAmount, onUpdateQty, onRemoveItem, onClear, onHold, onCheckout, onOpenDiscount, onRemoveDiscount }: Props) {
```

In the footer, the markup currently begins:
```tsx
      {/* Footer */}
      <div className="shrink-0 bg-card border-t border-border p-3">
        <div className="flex gap-2">
```
Insert a discount row just inside the footer `<div>`, before `<div className="flex gap-2">`:
```tsx
      {/* Footer */}
      <div className="shrink-0 bg-card border-t border-border p-3 space-y-2">
        {discountLabel ? (
          <div className="flex items-center justify-between bg-background border border-border rounded-lg px-2.5 py-1.5">
            <span className="text-xs text-foreground truncate">{discountLabel}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-green-500">−₱{fmt(discountAmount)}</span>
              <button onClick={onRemoveDiscount} aria-label="Remove discount" className="text-muted-foreground hover:text-destructive cursor-pointer rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onOpenDiscount}
            disabled={cart.length === 0}
            className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border text-muted-foreground text-xs rounded-lg py-2 hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Tag className="w-3.5 h-3.5" /> SC / PWD / Solo Parent
          </button>
        )}
        <div className="flex gap-2">
```
(The closing tags of the footer stay the same; we added `space-y-2` to the footer container and a discount row above the button row.)

- [ ] **Step 4.2: Verify build**

```bash
npm run typecheck:web 2>&1 | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: no output (SalesPage not yet passing the new props will error — that's fixed in Task 5; if this task is verified alone, expect a CartSidebar-usage error in SalesPage only).

- [ ] **Step 4.3: Commit**

```bash
git add src/renderer/src/components/CartSidebar.tsx
git commit -m "feat(discount): add discount control to CartSidebar"
```

---

## Task 5: SalesPage wiring

**Files:**
- Modify: `src/renderer/src/pages/SalesPage.tsx`

- [ ] **Step 5.1: Import discount helpers and DiscountDialog**

At the top of `src/renderer/src/pages/SalesPage.tsx`, the imports include:
```ts
import { cartTotal } from '@/lib/cart'
import type { CartItem } from '@/lib/cart'
```
Add below them:
```ts
import { computeSale, HOLDER_LABELS } from '@/lib/discount'
import DiscountDialog, { type Holder } from '@/components/DiscountDialog'
```
(`cartTotal` import may now be unused — remove it from the import if so to avoid a lint error: change `import { cartTotal } from '@/lib/cart'` to nothing and keep the `CartItem` type import.)

- [ ] **Step 5.2: Add discount state and sale computation**

Find:
```ts
  const [showCheckout, setShowCheckout] = useState(false)
  const [showHold, setShowHold] = useState(false)
```
Add after it:
```ts
  const [discount, setDiscount] = useState<Holder | null>(null)
  const [showDiscount, setShowDiscount] = useState(false)
```

Find the line:
```ts
  const total = cartTotal(cart)
```
Replace with:
```ts
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
```

- [ ] **Step 5.3: Clear discount on clearCart**

Find:
```ts
  const clearCart = useCallback(() => {
    setCart([])
    setCustomer(null)
  }, [])
```
Replace with:
```ts
  const clearCart = useCallback(() => {
    setCart([])
    setCustomer(null)
    setDiscount(null)
  }, [])
```

- [ ] **Step 5.4: Pass new props to CartSidebar and CheckoutDialog**

Find the `<CartSidebar` usage and add the discount props:
```tsx
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
```

Find the `<CheckoutDialog` usage:
```tsx
      {showCheckout && (
        <CheckoutDialog
          cart={cart}
          customer={customer}
          total={total}
          onClose={() => setShowCheckout(false)}
          onSuccess={() => { clearCart(); setShowCheckout(false); setTimeout(focusSearch, 0) }}
        />
      )}
```
Replace with (adds `sale` and `holder`):
```tsx
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
```

- [ ] **Step 5.5: Render the DiscountDialog**

Immediately after the `{showCheckout && (...)}` block, add:
```tsx
      {showDiscount && (
        <DiscountDialog
          current={discount}
          onApply={(h) => { setDiscount(h); setShowDiscount(false) }}
          onRemove={() => { setDiscount(null); setShowDiscount(false) }}
          onClose={() => setShowDiscount(false)}
        />
      )}
```

- [ ] **Step 5.6: Verify build**

```bash
npm run typecheck:web 2>&1 | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: CheckoutDialog usage errors only (new `sale`/`holder` props not yet declared) — fixed in Task 6. No other errors.

- [ ] **Step 5.7: Commit**

```bash
git add src/renderer/src/pages/SalesPage.tsx
git commit -m "feat(discount): wire holder selection and sale computation into SalesPage"
```

---

## Task 6: CheckoutDialog — payload + receipt data

**Files:**
- Modify: `src/renderer/src/components/CheckoutDialog.tsx`

- [ ] **Step 6.1: Import types and extend Props**

In `src/renderer/src/components/CheckoutDialog.tsx`, the type imports include:
```ts
import type { CartItem, PaymentEntry } from '@/lib/cart'
import type { CachedCustomer } from '@/lib/db'
```
Add:
```ts
import type { SaleCalc, HolderType } from '@/lib/discount'
import { HOLDER_LABELS } from '@/lib/discount'
```

The `Props` interface is:
```ts
interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  onClose: () => void
  onSuccess: () => void
}
```
Change to:
```ts
interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  sale: SaleCalc
  holder: { holderType: HolderType; holderName: string; holderId: string } | null
  onClose: () => void
  onSuccess: () => void
}
```
Update the destructure:
```ts
export default function CheckoutDialog({ cart, customer, total, sale, holder, onClose, onSuccess }: Props) {
```

- [ ] **Step 6.2: Add holders + partySize to the /api/sales payload**

In `handleSubmit`, the payload object currently ends with:
```ts
          globalDiscount: 0,
          discountMode: 'PERCENT',
          deliveryFee: 0,
          withholdingTax: 0,
          ewtMode: 'DEDUCT',
          holders: [],
          partySize: 1,
        }),
```
Replace the `holders: []` line with the real holder:
```ts
          globalDiscount: 0,
          discountMode: 'PERCENT',
          deliveryFee: 0,
          withholdingTax: 0,
          ewtMode: 'DEDUCT',
          holders: holder ? [{ holderType: holder.holderType, holderName: holder.holderName, holderId: holder.holderId, sequence: 1 }] : [],
          partySize: 1,
        }),
```

- [ ] **Step 6.3: Pass VAT, discount, and holder to the receipt**

In `handleSubmit`, the `printThermal({ ... })` call currently includes `customer`, `payments`, `cashTendered`, `change`, `details`. Add `vat`, `discount`, and `holder` fields. Find:
```ts
        await printThermal({
          invoiceNumber: data.invoiceNumber ?? data.invoice?.invoiceNumber ?? '',
          totalAmount: total,
          createdAt: data.createdAt ?? new Date().toISOString(),
          customer: customer ? { name: customer.name } : undefined,
          payments: receiptPayments,
          cashTendered: cashReceived > 0 ? cashReceived : undefined,
          change: changeDue > 0 ? changeDue : undefined,
          details: cart.map(item => ({
            quantity: item.quantity,
            unitPrice: item.product.price,
            total: item.product.price * item.quantity,
            product: { name: item.product.name },
          })),
        })
```
Replace with:
```ts
        await printThermal({
          invoiceNumber: data.invoiceNumber ?? data.invoice?.invoiceNumber ?? '',
          totalAmount: total,
          createdAt: data.createdAt ?? new Date().toISOString(),
          customer: customer ? { name: customer.name } : undefined,
          payments: receiptPayments,
          cashTendered: cashReceived > 0 ? cashReceived : undefined,
          change: changeDue > 0 ? changeDue : undefined,
          vat: sale.vat,
          discount: holder ? { label: `${HOLDER_LABELS[holder.holderType]} Disc`, amount: sale.discount + sale.vatExemptReduction } : undefined,
          holder: holder ? { type: HOLDER_LABELS[holder.holderType], name: holder.holderName, id: holder.holderId } : undefined,
          details: cart.map(item => ({
            quantity: item.quantity,
            unitPrice: item.product.price,
            total: item.product.price * item.quantity,
            product: { name: item.product.name },
          })),
        })
```

- [ ] **Step 6.4: Verify build**

```bash
npm run typecheck:web 2>&1 | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: errors only about `printThermal` data shape (new fields not yet on `ThermalInvoiceData`) — fixed in Task 7. No SalesPage/CheckoutDialog prop errors.

- [ ] **Step 6.5: Commit**

```bash
git add src/renderer/src/components/CheckoutDialog.tsx
git commit -m "feat(discount): send holders to /api/sales and pass VAT/discount to receipt"
```

---

## Task 7: Receipt — VAT breakdown, discount line, holder block

**Files:**
- Modify: `src/electron-main/escp-thermal.tsx`

- [ ] **Step 7.1: Extend `ThermalInvoiceData`**

In `src/electron-main/escp-thermal.tsx`, the `ThermalInvoiceData` interface includes a `payments?` field. Add three optional fields after it:
```ts
  vat?: { vatableSales: number; vatAmount: number; vatExemptSales: number; zeroRatedSales: number }
  discount?: { label: string; amount: number }
  holder?: { type: string; name: string; id: string }
```

- [ ] **Step 7.2: Use the passed VAT breakdown when present**

In `buildEscPosReceipt`, the VAT figures are currently derived from the total:
```ts
  const total = Number(inv.totalAmount) || 0
  const rate = bir.vatRate || 12
  const vatable = bir.vatRegistered ? round2(total / (1 + rate / 100)) : 0
  const vat = bir.vatRegistered ? round2(total - vatable) : 0
```
Replace with logic that prefers the real per-item breakdown:
```ts
  const total = Number(inv.totalAmount) || 0
  const rate = bir.vatRate || 12
  const v = inv.vat
  const vatableSales = v ? v.vatableSales : (bir.vatRegistered ? round2(total / (1 + rate / 100)) : 0)
  const vatAmount    = v ? v.vatAmount    : (bir.vatRegistered ? round2(total - vatableSales) : 0)
  const vatExempt    = v ? v.vatExemptSales : 0
  const zeroRated    = v ? v.zeroRatedSales : 0
```

The VAT breakdown JSX currently reads:
```tsx
      {bir.vatRegistered ? (
        <>
          <Text>{kv('VATable Sales', fmtAmount(vatable), width)}</Text>
          <Text>{kv('VAT-Exempt Sales', fmtAmount(0), width)}</Text>
          <Text>{kv('Zero-Rated Sales', fmtAmount(0), width)}</Text>
          <Text>{kv(`VAT (${rate}%)`, fmtAmount(vat), width)}</Text>
        </>
      ) : (
        <Text align='center'>NOT VALID FOR CLAIMING INPUT TAX</Text>
      )}
```
Replace with:
```tsx
      {bir.vatRegistered ? (
        <>
          <Text>{kv('VATable Sales', fmtAmount(vatableSales), width)}</Text>
          <Text>{kv('VAT-Exempt Sales', fmtAmount(vatExempt), width)}</Text>
          <Text>{kv('Zero-Rated Sales', fmtAmount(zeroRated), width)}</Text>
          <Text>{kv(`VAT (${rate}%)`, fmtAmount(vatAmount), width)}</Text>
        </>
      ) : (
        <Text align='center'>NOT VALID FOR CLAIMING INPUT TAX</Text>
      )}
```

- [ ] **Step 7.3: Add the discount line before TOTAL**

The total line currently reads:
```tsx
      <Line character='=' />
      <Text bold>{kv('TOTAL AMOUNT DUE', fmtAmount(total), width)}</Text>
```
Replace with (insert the discount line above it):
```tsx
      <Line character='=' />
      {inv.discount && inv.discount.amount > 0 && (
        <Text>{kv(`Less: ${inv.discount.label}`, '-' + fmtAmount(inv.discount.amount), width)}</Text>
      )}
      <Text bold>{kv('TOTAL AMOUNT DUE', fmtAmount(total), width)}</Text>
```

- [ ] **Step 7.4: Add the holder block in the footer**

The footer's permit lines start with:
```tsx
      <Br />
      {bir.ptuNo && <Text align='center'>{`PTU No: ${bir.ptuNo}`}</Text>}
```
Insert the holder block before that `<Br />`:
```tsx
      {inv.holder && (
        <>
          <Br />
          <Text>{`${inv.holder.type} Name: ${inv.holder.name}`}</Text>
          <Text>{`ID No: ${inv.holder.id}`}</Text>
          <Text>Signature: ____________________</Text>
        </>
      )}
      <Br />
      {bir.ptuNo && <Text align='center'>{`PTU No: ${bir.ptuNo}`}</Text>}
```

Note: the holder block must render in normal Font A. If the `FONT_B` raw command precedes this region, ensure the holder block is placed before the `<Raw data={FONT_B} />` line (it already is — the validity/permit Font-B section comes after the total/holder area). Verify placement: the holder block goes in the BIR footer region which is inside the Font B block. To keep the holder block readable, place it BEFORE `<Raw data={FONT_B} />`. Move the holder block to immediately after the TOTAL/tendered/change section and before the `<Line character='=' />` that precedes `<Raw data={FONT_B} />`. Concretely, insert the holder block right after the Change line and before the closing `<Line character='=' />`:
```tsx
      {inv.change != null && inv.change > 0 && (
        <Text>{kv('Change', fmtAmount(inv.change), width)}</Text>
      )}

      {inv.holder && (
        <>
          <Br />
          <Text>{`${inv.holder.type} Name: ${inv.holder.name}`}</Text>
          <Text>{`ID No: ${inv.holder.id}`}</Text>
          <Text>Signature: ____________________</Text>
        </>
      )}

      <Line character='=' />
```
(Do NOT also add the holder block in the footer; only this single placement.)

- [ ] **Step 7.5: Verify build + repro render**

```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:node 2>&1 | grep "error" || echo "node clean"
```
Expected: node clean.

- [ ] **Step 7.6: Commit**

```bash
git add src/electron-main/escp-thermal.tsx
git commit -m "feat(discount): receipt VAT breakdown, discount line, and holder block"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 8.1: Full typecheck**

```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error" | grep -v "vatType\|process\|EditSOPage\|NewSOPage"
```
Expected: no output.

- [ ] **Step 8.2: Run tests**

```bash
npm run test 2>&1 | tail -12
```
Expected: all pass including `discount.test.ts`.

- [ ] **Step 8.3: Smoke test in dev**

```bash
npm run dev
```
- On Sales: add a VATABLE item, click **SC / PWD / Solo Parent**, pick Senior Citizen, enter name + ID, Apply.
- Confirm the Amount Due banner drops (VAT removed + 20%) and a discount chip shows.
- Checkout → confirm → the printed/preview receipt shows VATable/Exempt split, a `Less: Senior Citizen Disc` line, and the holder block (Name / ID / Signature).
- Remove the discount via the chip ✕ and confirm the total returns to gross.

- [ ] **Step 8.4: Final commit (if anything pending)**

```bash
git add -A && git commit -m "feat(discount): complete BIR discount module v1" || echo "nothing to commit"
```
