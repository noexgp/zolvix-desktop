# Desktop Line Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let cashiers apply a per-line discount (entered as pesos or percent, normalized to a 4-dp percent) to selected cart lines on the Zolvix Desktop POS, gated by a new `enableLineDiscount` Business Setting, mutually exclusive with the statutory SC/PWD/Solo Parent discount, and reconciling exactly with the web server.

**Architecture:** A web `BusinessSetting.enableLineDiscount` flag (consumed by the desktop via the existing `/api/settings/business` → store flow) gates the feature. Each `CartItem` gains a `discountPct` (percent, 4 dp). Pure cart helpers convert peso↔percent and compute discounted line nets, which feed the already-tested `computeSale` (with `holders: []`, since line discount and statutory are mutually exclusive). Checkout sends each line's percent with sale-level `discountMode: 'PERCENT'`; the server's `Decimal(65,4)` line-discount column books it identically.

**Tech Stack:** Web — Next.js 16, Prisma 7, Zod 4. Desktop — Electron + React + TS, Vitest, react-thermal-printer.

**Spec:** `docs/superpowers/specs/2026-05-29-desktop-line-discount-design.md`

**Repos:** Web tasks run in `/Users/glenn/dev/zolvix`. Desktop tasks run in `/Users/glenn/dev/zolvix-desktop`. Each task states its repo.

---

## File Map

| Repo | File | Action |
|------|------|--------|
| web | `prisma/schema.prisma` | `enableLineDiscount` on `BusinessSetting` (+ migration) |
| web | `lib/validation.ts` | add field to `BusinessSettingsSchema` |
| web | `app/api/settings/business/route.ts` | GET returns + PATCH accepts/persists |
| web | `app/admin/settings/business/BusinessSettingsForm.tsx` | toggle |
| desktop | `src/renderer/src/lib/cart.ts` | `discountPct` on `CartItem` + pure helpers |
| desktop | `src/renderer/src/lib/__tests__/cart.test.ts` | helper tests (new) |
| desktop | `src/renderer/src/stores/appStore.ts` | `lineDiscount` on `BusinessSettings` |
| desktop | `src/renderer/src/App.tsx` | read `enableLineDiscount` into the store |
| desktop | `src/renderer/src/components/CartSidebar.tsx` | line-discount UI |
| desktop | `src/renderer/src/pages/SalesPage.tsx` | wire discounts + mutual exclusivity |
| desktop | `src/renderer/src/components/CheckoutDialog.tsx` | per-line payload + receipt |
| desktop | `src/electron-main/escp-thermal.tsx` | per-line discount on receipt |

---

## Task 1 (web): `enableLineDiscount` schema + migration

**Repo:** `/Users/glenn/dev/zolvix` · **File:** `prisma/schema.prisma`

- [ ] **Step 1.1:** In `model BusinessSetting`, near the other workflow booleans (e.g. `bypassAdjustmentApproval Boolean @default(false)`), add:
```prisma
  enableLineDiscount Boolean          @default(false)
```

- [ ] **Step 1.2:** Migrate:
```bash
cd /Users/glenn/dev/zolvix
npx prisma migrate dev --name add_enable_line_discount
```
Expected: migration created + applied; client regenerated. If TS doesn't see the field, run `npx prisma generate`.

- [ ] **Step 1.3: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(settings): add enableLineDiscount to BusinessSetting"
```

---

## Task 2 (web): thread `enableLineDiscount` through validation, API, settings form

**Repo:** `/Users/glenn/dev/zolvix` · **Files:** `lib/validation.ts`, `app/api/settings/business/route.ts`, `app/admin/settings/business/BusinessSettingsForm.tsx`

- [ ] **Step 2.1:** `lib/validation.ts` — in `BusinessSettingsSchema`, after `bypassAdjustmentApproval: z.boolean().optional(),` add:
```ts
  enableLineDiscount: z.boolean().optional(),
```

- [ ] **Step 2.2:** `app/api/settings/business/route.ts`:
  - In the GET authenticated response (next to `bypassAdjustmentApproval: setting.bypassAdjustmentApproval ?? false,`) add: `enableLineDiscount: setting.enableLineDiscount ?? false,`
  - In the GET `if (!setting)` default-response object, add: `enableLineDiscount: false,`
  - In the PATCH destructure of `parsed.data`, add `enableLineDiscount` to the names.
  - In the PATCH `update` upsert block, add: `...(enableLineDiscount !== undefined && { enableLineDiscount }),`
  - In the PATCH `create` upsert block, add: `enableLineDiscount: enableLineDiscount ?? false,`
  - In the PATCH response object, add: `enableLineDiscount: setting.enableLineDiscount ?? false,`

- [ ] **Step 2.3:** `app/admin/settings/business/BusinessSettingsForm.tsx` — mirror the `bypassAdjustmentApproval` toggle exactly:
  - Add `enableLineDiscount: boolean` to the form's interface/type.
  - Add `enableLineDiscount: false,` to the initial state defaults.
  - In the load mapping, add `enableLineDiscount: data.enableLineDiscount === true,`
  - In the PATCH save payload, add `enableLineDiscount: form.enableLineDiscount,`
  - Add a Switch in the "Inventory Workflow"-style section (or a new "POS Workflow" group). Use the same markup as the existing toggles:
```tsx
              <div className='flex items-center justify-between pt-3'>
                <div>
                  <p className='text-sm font-medium'>Enable Line Discount</p>
                  <p className='text-xs text-muted-foreground'>
                    Allow cashiers to apply per-line promotional discounts in the desktop POS. Cannot be combined with SC/PWD/Solo Parent discounts on the same sale.
                  </p>
                </div>
                <Switch
                  checked={form.enableLineDiscount}
                  onCheckedChange={(v) => setForm({ ...form, enableLineDiscount: v })}
                />
              </div>
```

- [ ] **Step 2.4: Verify**
```bash
cd /Users/glenn/dev/zolvix
npx tsc --noEmit 2>&1 | grep -E "validation|settings/business|BusinessSettingsForm" | grep -v __tests__ || echo "clean"
```
Expected: clean.

- [ ] **Step 2.5: Commit**
```bash
git add lib/validation.ts app/api/settings/business/route.ts app/admin/settings/business/BusinessSettingsForm.tsx
git commit -m "feat(settings): expose enableLineDiscount in API + settings form"
```

---

## Task 3 (desktop): cart helpers + tests

**Repo:** `/Users/glenn/dev/zolvix-desktop` · **Files:** `src/renderer/src/lib/cart.ts`, `src/renderer/src/lib/__tests__/cart.test.ts` (new). TDD.

- [ ] **Step 3.1:** Write the failing test file `src/renderer/src/lib/__tests__/cart.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pesoToPct, clampPct, lineNet, lineDiscountAmount } from '../cart'
import type { CartItem } from '../cart'
import type { CachedProduct } from '../db'

const prod = (price: number) => ({ id: 'p', name: 'P', price } as unknown as CachedProduct)
const item = (price: number, quantity: number, discountPct?: number): CartItem => ({ product: prod(price), quantity, discountPct })

describe('clampPct', () => {
  it('clamps to 0..100 and rounds to 4 dp', () => {
    expect(clampPct(150)).toBe(100)
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(33.333333)).toBe(33.3333)
  })
})

describe('pesoToPct', () => {
  it('converts peso to a 4-dp percent of the line gross', () => {
    expect(pesoToPct(50, 150)).toBe(33.3333)
    expect(pesoToPct(50, 200)).toBe(25)
  })
  it('caps at 100% when peso >= gross', () => {
    expect(pesoToPct(300, 150)).toBe(100)
  })
  it('is 0 when gross is 0', () => {
    expect(pesoToPct(50, 0)).toBe(0)
  })
})

describe('lineNet / lineDiscountAmount', () => {
  it('no discount → gross', () => {
    expect(lineNet(item(150, 1))).toBe(150)
    expect(lineDiscountAmount(item(150, 1))).toBe(0)
  })
  it('33.3333% off ₱150 → ₱100.00 net, ₱50.00 off', () => {
    const it = item(150, 1, 33.3333)
    expect(lineDiscountAmount(it)).toBe(50)
    expect(lineNet(it)).toBe(100)
  })
  it('applies to qty', () => {
    const it = item(100, 2, 10)
    expect(lineDiscountAmount(it)).toBe(20)
    expect(lineNet(it)).toBe(180)
  })
})
```

- [ ] **Step 3.2: Run, confirm fail** (functions not exported):
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/lib/__tests__/cart.test.ts 2>&1 | tail -6
```

- [ ] **Step 3.3:** In `src/renderer/src/lib/cart.ts`, add `discountPct` to `CartItem` and the helpers. Change the interface:
```ts
export interface CartItem {
  product: CachedProduct
  quantity: number
  discountPct?: number   // line discount as a percent, 4 dp; undefined/0 = none
}
```
And append these helpers (keep the existing `lineTotal`, `cartTotal`, etc.):
```ts
const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

export function clampPct(p: number): number {
  return round4(Math.min(100, Math.max(0, p)))
}

export function pesoToPct(peso: number, lineGross: number): number {
  if (lineGross <= 0) return 0
  return clampPct((peso / lineGross) * 100)
}

export function lineDiscountAmount(item: CartItem): number {
  const gross = lineTotal(item.product, item.quantity)
  return round2(gross * (item.discountPct ?? 0) / 100)
}

export function lineNet(item: CartItem): number {
  return round2(lineTotal(item.product, item.quantity) - lineDiscountAmount(item))
}
```

- [ ] **Step 3.4: Run, confirm pass**
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/lib/__tests__/cart.test.ts 2>&1 | tail -6
```
Expected: all passing.

- [ ] **Step 3.5: Commit**
```bash
git add src/renderer/src/lib/cart.ts src/renderer/src/lib/__tests__/cart.test.ts
git commit -m "feat(cart): line-discount helpers (peso↔percent, line net)"
```

---

## Task 4 (desktop): settings plumbing

**Repo:** `/Users/glenn/dev/zolvix-desktop` · **Files:** `src/renderer/src/stores/appStore.ts`, `src/renderer/src/App.tsx`

- [ ] **Step 4.1:** `src/renderer/src/stores/appStore.ts` — in the `BusinessSettings` interface (which has `bypassApproval: boolean`), add:
```ts
  lineDiscount: boolean
```

- [ ] **Step 4.2:** `src/renderer/src/App.tsx` — the settings fetch currently does:
```ts
              setBusinessSettings({ bypassApproval: !(business.requireSoApproval ?? true), name: business.name ?? '' })
```
Change it to include the new flag:
```ts
              setBusinessSettings({ bypassApproval: !(business.requireSoApproval ?? true), name: business.name ?? '', lineDiscount: business.enableLineDiscount === true })
```

- [ ] **Step 4.3: Verify**
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:web 2>&1 | grep -E "appStore|App.tsx" || echo "clean"
```
Expected: clean (any other component that constructs `BusinessSettings` would now error — there should be none besides App.tsx; if there is, add `lineDiscount` there too).

- [ ] **Step 4.4: Commit**
```bash
git add src/renderer/src/stores/appStore.ts src/renderer/src/App.tsx
git commit -m "feat(settings): read enableLineDiscount into the desktop store"
```

---

## Task 5 (desktop): CartSidebar line-discount UI

**Repo:** `/Users/glenn/dev/zolvix-desktop` · **File:** `src/renderer/src/components/CartSidebar.tsx`

Add multi-select + an "apply discount to selected" bar, gated by `lineDiscountEnabled` and hidden when a statutory discount is active. Replace the ENTIRE file with:
```tsx
import { useState, useEffect } from 'react'
import type { CartItem } from '@/lib/cart'
import { lineTotal, lineNet, lineDiscountAmount } from '@/lib/cart'
import type { CachedCustomer } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Minus, Plus, X, ShoppingCart, Trash2, Pause, ArrowRight, Tag, Percent } from 'lucide-react'

function QtyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9]/g, '')
        setText(v)
        const n = parseInt(v, 10)
        if (!isNaN(n) && n >= 1) onChange(n)
      }}
      onBlur={() => { if (!/^[1-9][0-9]*$/.test(text)) setText(String(value)) }}
      onFocus={e => e.target.select()}
      className="w-8 bg-transparent text-foreground text-sm font-medium text-center outline-none"
    />
  )
}

interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  discountLabel: string | null
  discountAmount: number
  lineDiscountEnabled: boolean
  onUpdateQty: (productId: string, qty: number) => void
  onRemoveItem: (productId: string) => void
  onClear: () => void
  onHold: () => void
  onCheckout: () => void
  onOpenDiscount: () => void
  onRemoveDiscount: () => void
  onSetLineDiscount: (productIds: string[], mode: 'PESO' | 'PERCENT', value: number) => void
  onClearLineDiscount: (productId: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CartSidebar({ cart, customer, total, discountLabel, discountAmount, lineDiscountEnabled, onUpdateQty, onRemoveItem, onClear, onHold, onCheckout, onOpenDiscount, onRemoveDiscount, onSetLineDiscount, onClearLineDiscount }: Props) {
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)
  const customerName = customer?.name ?? 'Walk-in'

  const hasLineDiscount = cart.some(i => (i.discountPct ?? 0) > 0)
  // Line discount is available only when enabled, no statutory discount is set.
  const lineDiscountActive = lineDiscountEnabled && !discountLabel
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'PESO' | 'PERCENT'>('PERCENT')
  const [value, setValue] = useState('')

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const apply = () => {
    const v = Number(value)
    if (!selected.size || !Number.isFinite(v) || v <= 0) return
    onSetLineDiscount([...selected], mode, v)
    setSelected(new Set())
    setValue('')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-gradient-to-br from-orange-500 to-amber-600 px-4 py-4 text-center border-b-2 border-orange-600">
        <p className="text-orange-100 text-[10px] tracking-[0.15em] uppercase mb-0.5">Amount Due</p>
        <p className="text-white text-4xl font-extrabold tracking-tight leading-none">₱{fmt(total)}</p>
        <p className="text-orange-100 text-[10px] mt-1">{customerName} · {itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
      </div>

      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-card border-b border-border">
        <span className="text-muted-foreground text-xs font-medium">
          {cart.length === 0 ? 'Cart' : `${cart.length} ${cart.length === 1 ? 'line' : 'lines'}`}
        </span>
        {cart.length > 0 && (
          <button onClick={onClear} className="flex items-center gap-1 text-destructive text-xs hover:bg-destructive/10 rounded px-2 py-1 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {cart.length === 0 && (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-16 gap-2">
            <ShoppingCart className="w-8 h-8 opacity-30" />
            <p className="text-xs">Cart is empty</p>
            <p className="text-[10px] opacity-70">Tap a product to add it</p>
          </div>
        )}
        {cart.map(item => {
          const pct = item.discountPct ?? 0
          const gross = lineTotal(item.product, item.quantity)
          return (
            <div key={item.product.id} className="bg-background rounded-lg p-2.5 space-y-2 border border-transparent hover:border-border transition-colors">
              <div className="flex items-start justify-between gap-2">
                {lineDiscountActive && (
                  <input
                    type="checkbox"
                    aria-label="Select line for discount"
                    checked={selected.has(item.product.id)}
                    onChange={() => toggle(item.product.id)}
                    className="mt-0.5 cursor-pointer"
                  />
                )}
                <span className="text-foreground text-xs font-medium leading-tight flex-1 line-clamp-2">{item.product.name}</span>
                <button onClick={() => onRemoveItem(item.product.id)} aria-label="Remove item" className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0 rounded p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center bg-card rounded-lg border border-border overflow-hidden">
                  <button onClick={() => onUpdateQty(item.product.id, item.quantity - 1)} aria-label="Decrease quantity" className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Minus className="w-3 h-3" />
                  </button>
                  <QtyInput value={item.quantity} onChange={qty => onUpdateQty(item.product.id, qty)} />
                  <button onClick={() => onUpdateQty(item.product.id, item.quantity + 1)} aria-label="Increase quantity" className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-right">
                  {pct > 0 ? (
                    <>
                      <div className="text-foreground text-sm font-semibold whitespace-nowrap">₱{fmt(lineNet(item))}</div>
                      <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 justify-end">
                        −₱{fmt(lineDiscountAmount(item))} ({fmt(pct)}%)
                        <button onClick={() => onClearLineDiscount(item.product.id)} aria-label="Clear line discount" className="text-muted-foreground hover:text-destructive cursor-pointer rounded">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-muted-foreground text-[10px] line-through">₱{fmt(gross)}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-foreground text-sm font-semibold whitespace-nowrap">₱{fmt(gross)}</div>
                      <div className="text-muted-foreground text-[10px]">₱{fmt(item.product.price)} ea</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 bg-card border-t border-border p-3 space-y-2">
        {lineDiscountActive && selected.size > 0 && (
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2 py-1.5">
            <div className="flex rounded-md border border-border overflow-hidden">
              <button onClick={() => setMode('PERCENT')} className={`px-2 py-1 text-xs cursor-pointer ${mode === 'PERCENT' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>%</button>
              <button onClick={() => setMode('PESO')} className={`px-2 py-1 text-xs cursor-pointer ${mode === 'PESO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>₱</button>
            </div>
            <input type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder={mode === 'PERCENT' ? '% off' : '₱ off'} className="flex-1 h-8 px-2 rounded-md border border-border bg-card text-sm outline-none" />
            <Button size="sm" className="h-8 text-xs" onClick={apply}>Apply to {selected.size}</Button>
          </div>
        )}
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
            disabled={cart.length === 0 || hasLineDiscount}
            title={hasLineDiscount ? 'Remove line discounts first' : undefined}
            className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border text-muted-foreground text-xs rounded-lg py-2 hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Tag className="w-3.5 h-3.5" /> SC / PWD / Solo Parent
          </button>
        )}
        {lineDiscountActive && !hasLineDiscount && selected.size === 0 && cart.length > 0 && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Percent className="w-3 h-3" /> Tick lines, then set a ₱/% discount.</p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1 h-10 text-xs gap-1.5" disabled={cart.length === 0} onClick={onHold}>
            <Pause className="w-3.5 h-3.5" /> Hold
            <kbd className="text-[9px] opacity-60 font-mono">F2</kbd>
          </Button>
          <Button size="sm" className="flex-[2] h-10 text-sm font-semibold gap-1.5" disabled={cart.length === 0} onClick={onCheckout}>
            Checkout
            <kbd className="text-[9px] opacity-70 font-mono">F3</kbd>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5.1: Verify** (SalesPage will error until Task 6 supplies the new props):
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:web 2>&1 | grep -E "CartSidebar" || echo "CartSidebar clean"
```
Expected: `CartSidebar clean`.

- [ ] **Step 5.2: Commit**
```bash
git add src/renderer/src/components/CartSidebar.tsx
git commit -m "feat(cart): line-discount multi-select UI in CartSidebar"
```

---

## Task 6 (desktop): wire SalesPage (discounts + mutual exclusivity)

**Repo:** `/Users/glenn/dev/zolvix-desktop` · **File:** `src/renderer/src/pages/SalesPage.tsx`

Context: `cart` is `CartItem[]` via `useState`; `discount` is `PrivilegedDiscount | null`; `computeSale(cart.map(... lineTotal ...), discount?.holders ?? [], discount?.partySize ?? 1)`; `<CartSidebar .../>` is rendered with the existing props. `useAppStore` exposes `businessSettings`.

- [ ] **Step 6.1:** Add the cart helper + store imports. The file imports `computeSale` from `@/lib/discount` and `type { CartItem } from '@/lib/cart'`. Ensure these imports exist (add what's missing):
```ts
import { lineNet, pesoToPct, clampPct } from '@/lib/cart'
import { useAppStore } from '@/stores/appStore'
```

- [ ] **Step 6.2:** Read the setting near the other hooks/state:
```ts
  const businessSettings = useAppStore(s => s.businessSettings)
  const lineDiscountEnabled = businessSettings?.lineDiscount ?? false
```

- [ ] **Step 6.3:** Change the `computeSale` cart mapping to use the discounted net (replace `lineTotal: Math.round(i.product.price * i.quantity * 100) / 100` with `lineNet(i)`):
```ts
  const sale = computeSale(
    cart.map(i => ({
      lineTotal: lineNet(i),
      vatType: i.product.vatType ?? 'VATABLE',
      scDiscountExempt: i.product.scDiscountExempt ?? false,
    })),
    discount?.holders ?? [],
    discount?.partySize ?? 1,
  )
```

- [ ] **Step 6.4:** Add the line-discount handlers (near the other cart mutators like `updateQty`):
```ts
  const setLineDiscount = (productIds: string[], mode: 'PESO' | 'PERCENT', value: number) => {
    const ids = new Set(productIds)
    setCart(prev => prev.map(it => {
      if (!ids.has(it.product.id)) return it
      const gross = Math.round(it.product.price * it.quantity * 100) / 100
      const pct = mode === 'PERCENT' ? clampPct(value) : pesoToPct(value, gross)
      return { ...it, discountPct: pct }
    }))
  }
  const clearLineDiscount = (productId: string) => {
    setCart(prev => prev.map(it => (it.product.id === productId ? { ...it, discountPct: undefined } : it)))
  }
```
(Use the actual cart state setter name from this file — it's the `useState` setter for `cart`; if it's not literally `setCart`, use whatever it is.)

- [ ] **Step 6.5:** Enforce mutual exclusivity — when a statutory discount is applied, clear any line discounts. Find where the statutory discount is set (the `DiscountDialog` `onApply` handler that calls `setDiscount(d)`). Change it to also clear line discounts:
```tsx
          onApply={(d) => { setCart(prev => prev.map(it => ({ ...it, discountPct: undefined }))); setDiscount(d); setShowDiscount(false) }}
```
(The CartSidebar already disables the SC/PWD button while line discounts exist, so this is the belt-and-suspenders direction.)

- [ ] **Step 6.6:** Pass the new props to `<CartSidebar />`:
```tsx
        <CartSidebar
          cart={cart}
          customer={customer}
          total={total}
          discountLabel={discountLabel}
          discountAmount={sale.discount + sale.vatExemptReduction}
          lineDiscountEnabled={lineDiscountEnabled}
          onUpdateQty={updateQty}
          onRemoveItem={removeItem}
          onClear={clearCart}
          onHold={() => setShowHold(true)}
          onCheckout={() => setShowCheckout(true)}
          onOpenDiscount={() => setShowDiscount(true)}
          onRemoveDiscount={() => setDiscount(null)}
          onSetLineDiscount={setLineDiscount}
          onClearLineDiscount={clearLineDiscount}
        />
```
(Match the existing handler names — `onUpdateQty`/`onRemoveItem`/`onClear`/etc. already exist with those bindings; only add `lineDiscountEnabled`, `onSetLineDiscount`, `onClearLineDiscount`.)

- [ ] **Step 6.7: Verify**
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:web 2>&1 | grep -E "SalesPage|CartSidebar" || echo "clean"
```
Expected: clean (CheckoutDialog may still error on the discounted total until Task 7 — but Task 7 only changes payload/receipt; the `total` it receives is already `sale.amountDue`. If CheckoutDialog errors here, it's unrelated to this task — leave for Task 7).

- [ ] **Step 6.8: Commit**
```bash
git add src/renderer/src/pages/SalesPage.tsx
git commit -m "feat(cart): wire line discounts + mutual exclusivity in SalesPage"
```

---

## Task 7 (desktop): checkout payload + receipt per-line discount

**Repo:** `/Users/glenn/dev/zolvix-desktop` · **Files:** `src/renderer/src/components/CheckoutDialog.tsx`, `src/electron-main/escp-thermal.tsx`

Context: the `/api/sales` cart map sends `discount: 0`; the receipt `details` map sends `{ quantity, unitPrice, total, product }`. The receipt builder's `itemLines(name, qty, unitPrice, total, width)` prints 2 lines per item.

- [ ] **Step 7.1:** `CheckoutDialog.tsx` — in the `/api/sales` `cart: cart.map(item => ({...}))`, change `discount: 0` to the line's percent and ensure the sale-level mode is percent. Replace:
```ts
            discount: 0,
```
with:
```ts
            discount: item.discountPct ?? 0,
```
And confirm the top-level body has `discountMode: 'PERCENT'` (it already sends `discountMode: 'PERCENT'`). Leave it.

- [ ] **Step 7.2:** `CheckoutDialog.tsx` — pass per-line discount into the receipt `details`. Find the `details: cart.map(item => ({ quantity, unitPrice, total, product }))` in the `printThermal`/`baseReceipt` object and change it to:
```ts
          details: cart.map(item => {
            const gross = item.product.price * item.quantity
            const pct = item.discountPct ?? 0
            const disc = Math.round(gross * pct / 100 * 100) / 100
            return {
              quantity: item.quantity,
              unitPrice: item.product.price,
              total: Math.round((gross - disc) * 100) / 100,
              discountAmount: disc > 0 ? disc : undefined,
              product: { name: item.product.name },
            }
          }),
```

- [ ] **Step 7.3:** `escp-thermal.tsx` — extend the `details` item type in `ThermalInvoiceData`. Find:
```ts
  details?: Array<{
    quantity: number
    unitPrice: number | string
    total: number | string
    product?: { name?: string }
  }>
```
and add a `discountAmount` field:
```ts
  details?: Array<{
    quantity: number
    unitPrice: number | string
    total: number | string
    discountAmount?: number
    product?: { name?: string }
  }>
```

- [ ] **Step 7.4:** `escp-thermal.tsx` — render a discount sub-line under each discounted item. The current details render looks like `{(inv.details ?? []).map((d, i) => itemLines(d.product?.name ?? '', d.quantity, d.unitPrice, d.total, width).map((l, j) => (<Text key={...}>{l}</Text>)))}`. Replace that whole `{(inv.details ?? []).map(...)}` expression with a `flatMap` version (keyed elements, no `React.Fragment` — same approach as the existing holders block in this file):
```tsx
      {(inv.details ?? []).flatMap((d, i) => {
        const lines = itemLines(d.product?.name ?? '', d.quantity, d.unitPrice, d.total, width)
          .map((l, j) => <Text key={`it-${i}-${j}`}>{l}</Text>)
        if (d.discountAmount != null && d.discountAmount > 0) {
          lines.push(<Text key={`disc-${i}`}>{`    Less Disc: -${fmtAmount(d.discountAmount)}`}</Text>)
        }
        return lines
      })}
```
Read the existing block first to match its exact current form (the key names on the inner `<Text>` may differ — preserve uniqueness).

- [ ] **Step 7.5: Verify**
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep -E "CheckoutDialog|escp-thermal" || echo "clean (CheckoutDialog + escp-thermal)"
```
Expected: clean (the 3 known pre-existing errors in Versions.tsx/EditSOPage.tsx/NewSOPage.tsx are unrelated).

- [ ] **Step 7.6: Commit**
```bash
git add src/renderer/src/components/CheckoutDialog.tsx src/electron-main/escp-thermal.tsx
git commit -m "feat(checkout): send per-line discount + show it on the receipt"
```

---

## Task 8: full verification

- [ ] **Step 8.1: Web** — `cd /Users/glenn/dev/zolvix && npx tsc --noEmit 2>&1 | grep -vE "lib/__tests__/" | grep -E "\.tsx?\(" | head || echo "no app/src errors"` then `npm run test 2>&1 | tail -5`. Expected: no new errors; tests pass.

- [ ] **Step 8.2: Desktop** — `cd /Users/glenn/dev/zolvix-desktop && npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"` then `npx vitest run src/renderer/src/lib/__tests__/cart.test.ts src/renderer/src/lib/__tests__/discount.test.ts 2>&1 | tail -6`. Expected: clean; all pass.

- [ ] **Step 8.3: Reconciliation sanity** — a line of ₱150 with ₱50 off → pct 33.3333, `lineNet` 100.00. The desktop sends `discount: 33.3333`, `discountMode: 'PERCENT'`; the server's `calcLineTotal(1, 150, 33.3333, 'PERCENT')` = `150 × (1 − 0.333333)` = 100.00 → charged = booked.

- [ ] **Step 8.4: Manual smoke (dev).**
  - In the web app, Settings → Business: turn **Enable Line Discount** ON, save. Restart/relaunch the desktop so it re-fetches settings.
  - Desktop: add 3 items. Tick 2 lines → choose %, enter 10 → "Apply to 2" → both lines show −10% and discounted totals; Amount Due drops accordingly. Tick a ₱150 line → ₱, enter 50 → shows 33.3333% / −₱50.00, net ₱100.00. Clear one line's discount via its ×.
  - The SC/PWD button is disabled while any line discount exists; applying a statutory discount (after clearing line discounts) is allowed and re-disables line-discount controls.
  - Checkout → server accepts (no error), the booked total equals Amount Due; receipt shows each discounted line with "Less Disc: -₱X.XX".
  - In the web app, turn the setting OFF → the desktop (after re-fetch) shows no line-discount UI; statutory still works.

- [ ] **Step 8.5: Final commit (if pending)** — `git add -A && git commit -m "feat: desktop line discount (settings-gated)" || echo "nothing to commit"` in whichever repo has pending changes.
