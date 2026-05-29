# Desktop Multi-Holder Statutory Discount + Signed Two-Copy Receipt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support multiple SC/PWD/Solo Parent holders with a head count (party size) on the Zolvix Desktop sales screen, computed to match the web server, and print two receipt copies for privileged-discount sales — an establishment copy with per-holder signature lines and a customer copy without.

**Architecture:** Upgrade the pure `computeSale` to take `holders[] + partySize` (mirroring the web's `computeSaleTotals` so desktop totals equal server totals). Replace the single-holder dialog with a multi-holder panel, thread the `{ holders, partySize }` shape through `SalesPage` and `CheckoutDialog`, send all holders + party size to `/api/sales`, and extend the thermal receipt to render multiple holders + an optional signature section, printed twice for privileged sales.

**Tech Stack:** Electron + React + TypeScript, Vitest, react-thermal-printer (receipt).

**Spec:** `docs/superpowers/specs/2026-05-29-desktop-multi-holder-statutory-discount-design.md`

---

## File Map

| File | Action |
|------|--------|
| `src/renderer/src/lib/discount.ts` | `computeSale(items, holders[], partySize)`; export `Holder` + `PrivilegedDiscount` |
| `src/renderer/src/lib/__tests__/discount.test.ts` | Update calls to new signature; add multi-holder cases |
| `src/electron-main/escp-thermal.tsx` | Receipt data `holder` → `holders[]` + `withSignature`/`copyLabel`; per-holder render |
| `src/renderer/src/components/DiscountDialog.tsx` | Multi-holder panel: head count + holders list |
| `src/renderer/src/pages/SalesPage.tsx` | `discount` state → `{ holders, partySize }`; pass to compute/dialog/checkout |
| `src/renderer/src/components/CheckoutDialog.tsx` | Send all holders + party size; print two signed copies |

---

## Task 1: `computeSale` — multi-holder + party size

**Files:** `src/renderer/src/lib/discount.ts`, `src/renderer/src/lib/__tests__/discount.test.ts`

- [ ] **Step 1.1: Update the tests first (they will fail to compile).** Replace the whole body of `src/renderer/src/lib/__tests__/discount.test.ts` with:
```ts
import { describe, it, expect } from 'vitest'
import { computeSale } from '../discount'
import type { DiscountItem, HolderType } from '../discount'

const vatable = (lineTotal: number, scDiscountExempt = false): DiscountItem => ({ lineTotal, vatType: 'VATABLE', scDiscountExempt })
const exempt  = (lineTotal: number): DiscountItem => ({ lineTotal, vatType: 'EXEMPT', scDiscountExempt: false })
const zero    = (lineTotal: number): DiscountItem => ({ lineTotal, vatType: 'ZERO_RATED', scDiscountExempt: false })
const h = (t: HolderType) => ({ holderType: t, holderName: 'N', holderId: 'ID' })

describe('computeSale — no holder', () => {
  it('splits a VATABLE cart into net sales + VAT', () => {
    const r = computeSale([vatable(112)], [], 1)
    expect(r.vat.vatableSales).toBeCloseTo(100, 2)
    expect(r.vat.vatAmount).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(112, 2)
    expect(r.discount).toBe(0)
  })
  it('classifies EXEMPT and ZERO_RATED separately', () => {
    const r = computeSale([vatable(112), exempt(50), zero(30)], [], 1)
    expect(r.vat.vatableSales).toBeCloseTo(100, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(50, 2)
    expect(r.vat.zeroRatedSales).toBeCloseTo(30, 2)
    expect(r.amountDue).toBeCloseTo(192, 2)
  })
})

describe('computeSale — single SC/PWD (party of 1)', () => {
  it('removes VAT and gives 20% off the net base', () => {
    const r = computeSale([vatable(112)], [h('SC')], 1)
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.amountDue).toBeCloseTo(80, 2)
    expect(r.vat.vatableSales).toBeCloseTo(0, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(100, 2)
  })
  it('excludes scDiscountExempt items (e.g. liquor) from the eligible base', () => {
    const r = computeSale([vatable(112), vatable(50, true)], [h('PWD')], 1)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(130, 2)
  })
  it('gives 20% off an EXEMPT item at face value with no VAT step-down', () => {
    const r = computeSale([exempt(112)], [h('SC')], 1)
    expect(r.discount).toBeCloseTo(22.4, 2)
    expect(r.vatExemptReduction).toBeCloseTo(0, 2)
    expect(r.amountDue).toBeCloseTo(89.6, 2)
  })
})

describe('computeSale — Solo Parent (party of 1)', () => {
  it('gives 10% off eligible with no VAT exemption', () => {
    const r = computeSale([vatable(200)], [h('SOLO_PARENT')], 1)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.vatExemptReduction).toBe(0)
    expect(r.amountDue).toBeCloseTo(180, 2)
    expect(r.vat.vatableSales).toBeCloseTo(178.57, 2)
  })
})

describe('computeSale — multiple holders + party size', () => {
  it('2 SC in a party of 4 → discount on half the eligible base', () => {
    const r = computeSale([vatable(112)], [h('SC'), h('SC')], 4)
    // fraction 0.5: 20% × (100 net) × 0.5 = 10; VAT reduction 12 × 0.5 = 6
    expect(r.discount).toBeCloseTo(10, 2)
    expect(r.vatExemptReduction).toBeCloseTo(6, 2)
    expect(r.amountDue).toBeCloseTo(96, 2)
    expect(r.vat.vatableSales).toBeCloseTo(50, 2)
    expect(r.vat.vatAmount).toBeCloseTo(6, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(50, 2)
  })
  it('party size is clamped to at least the number of holders', () => {
    // 2 SC, partySize passed as 1 → clamped to 2 → fraction 1 → full 20%
    const r = computeSale([vatable(112)], [h('SC'), h('SC')], 1)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.amountDue).toBeCloseTo(80, 2)
  })
})
```

- [ ] **Step 1.2: Run tests to confirm they fail to compile** (signature mismatch):
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/lib/__tests__/discount.test.ts 2>&1 | tail -8
```
Expected: FAIL (computeSale expects a `HolderType | null`, not `holders[] + partySize`).

- [ ] **Step 1.3: Replace `computeSale` and add the types** in `src/renderer/src/lib/discount.ts`. Replace the existing `computeSale` function (the `export function computeSale(items, holderType ...) { ... }`) and add the `Holder`/`PrivilegedDiscount` exports. Keep `HolderType`, `DiscountItem`, `VatBreakdown`, `SaleCalc`, `HOLDER_LABELS` as they are. New code:
```ts
export interface Holder {
  holderType: HolderType
  holderName: string
  holderId: string
}

export interface PrivilegedDiscount {
  holders: Holder[]
  partySize: number
}

export function computeSale(
  items: DiscountItem[],
  holders: { holderType: HolderType }[],
  partySize: number,
): SaleCalc {
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

  if (holders.length > 0) {
    const party = Math.max(partySize, holders.length)
    const scPwdCount = holders.filter(h => h.holderType === 'SC' || h.holderType === 'PWD').length
    const spCount = holders.filter(h => h.holderType === 'SOLO_PARENT').length
    const scPwdFraction = scPwdCount / party
    const spFraction = spCount / party

    const eligible = items.filter(i => !i.scDiscountExempt)
    const isVatable = (t: string) => t !== 'EXEMPT' && t !== 'ZERO_RATED'
    const vatableEligible = eligible.filter(i => isVatable(i.vatType)).reduce((s, i) => s + i.lineTotal, 0)
    const exemptEligible = eligible.filter(i => !isVatable(i.vatType)).reduce((s, i) => s + i.lineTotal, 0)
    const netBase = vatableEligible / VAT_DIVISOR

    // SC/PWD: 20% on (VATABLE net + EXEMPT face) × fraction; VAT removed from the VATABLE share only.
    const scPwdDiscount = (netBase + exemptEligible) * 0.20 * scPwdFraction
    const scPwdVatReduction = (vatableEligible - netBase) * scPwdFraction
    const scPwdExemptNet = netBase * scPwdFraction
    // Solo Parent: 10% on eligible (VATABLE + EXEMPT face) × fraction; no VAT step-down.
    const spDiscount = (vatableEligible + exemptEligible) * 0.10 * spFraction

    discount = scPwdDiscount + spDiscount
    vatExemptReduction = scPwdVatReduction
    vatableSales -= scPwdExemptNet
    vatAmount -= scPwdVatReduction
    vatExemptSales += scPwdExemptNet
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
```

- [ ] **Step 1.4: Run tests to confirm pass**
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/lib/__tests__/discount.test.ts 2>&1 | tail -6
```
Expected: all passing (10 tests).

- [ ] **Step 1.5: Commit**
```bash
git add src/renderer/src/lib/discount.ts src/renderer/src/lib/__tests__/discount.test.ts
git commit -m "feat(discount): computeSale supports multiple holders + party size"
```

---

## Task 2: Receipt — multiple holders + optional signature section

**Files:** `src/electron-main/escp-thermal.tsx`

Context: `ThermalInvoiceData` (the interface ending ~line 95) currently has `holder?: { type: string; name: string; id: string }`. The render block (~lines 191-198) prints one holder + one `Signature: ____` line. `Text`/`Br` are react-thermal-printer components already imported in the file.

- [ ] **Step 2.1:** In the `ThermalInvoiceData` interface, replace:
```ts
  holder?: { type: string; name: string; id: string }
```
with:
```ts
  holders?: Array<{ type: string; name: string; id: string }>
  withSignature?: boolean
  copyLabel?: string
```

- [ ] **Step 2.2:** Replace the render block (the `{inv.holder && ( ... )}` block, ~lines 191-198) with the following. It uses `flatMap` returning keyed `<Text>` elements — no `React.Fragment`, so no extra import is needed (the surrounding `<>` fragment is the same form the original block already used):
```tsx
      {inv.holders && inv.holders.length > 0 && (
        <>
          <Br />
          {inv.holders.flatMap((hld, idx) => {
            const lines = [
              <Text key={`hn${idx}`}>{`${hld.type} Name: ${hld.name}`}</Text>,
              <Text key={`hi${idx}`}>{`ID No: ${hld.id}`}</Text>,
            ]
            if (inv.withSignature) lines.push(<Text key={`hs${idx}`}>Signature: ____________________</Text>)
            return lines
          })}
        </>
      )}
      {inv.copyLabel && (
        <>
          <Br />
          <Text align="center">{inv.copyLabel}</Text>
        </>
      )}
```
(`<Text align="center">` is already used for the business header in this file, so the `align` prop is supported.)

- [ ] **Step 2.3: Verify (node typecheck)**
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:node 2>&1 | tail -8
```
Expected: no errors (exit 0, no output after the script banner).

- [ ] **Step 2.4: Commit**
```bash
git add src/electron-main/escp-thermal.tsx
git commit -m "feat(receipt): render multiple holders + optional signature/copy label"
```

---

## Task 3: Multi-holder discount panel

**Files:** `src/renderer/src/components/DiscountDialog.tsx`

Replace the single-holder dialog with a multi-holder panel. It imports `Holder`/`PrivilegedDiscount`/`HolderType`/`HOLDER_LABELS` from `@/lib/discount` (no longer defines its own `Holder`).

- [ ] **Step 3.1:** Replace the entire contents of `src/renderer/src/components/DiscountDialog.tsx` with:
```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HolderType, Holder, PrivilegedDiscount } from '@/lib/discount'
import { HOLDER_LABELS } from '@/lib/discount'

interface Props {
  current: PrivilegedDiscount | null
  onApply: (d: PrivilegedDiscount) => void
  onRemove: () => void
  onClose: () => void
}

const TYPES: HolderType[] = ['SC', 'PWD', 'SOLO_PARENT']
const emptyHolder = (): Holder => ({ holderType: 'SC', holderName: '', holderId: '' })

export default function DiscountDialog({ current, onApply, onRemove, onClose }: Props) {
  const [holders, setHolders] = useState<Holder[]>(current?.holders?.length ? current.holders : [emptyHolder()])
  const [partySize, setPartySize] = useState<number>(current?.partySize ?? 1)

  const update = (i: number, patch: Partial<Holder>) =>
    setHolders(hs => hs.map((h, idx) => (idx === i ? { ...h, ...patch } : h)))
  const addHolder = () => setHolders(hs => [...hs, emptyHolder()])
  const removeHolder = (i: number) => setHolders(hs => hs.filter((_, idx) => idx !== i))

  const effectiveParty = Math.max(partySize, holders.length)
  const allValid = holders.every(h => h.holderName.trim() && h.holderId.trim())
  const canApply = holders.length > 0 && allValid

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-[28rem] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-foreground font-semibold">Privileged Discount</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Head Count (party size)</Label>
            <Input
              type="number"
              min={holders.length}
              value={partySize}
              onChange={e => setPartySize(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 text-sm w-28"
            />
            <p className="text-[11px] text-muted-foreground">{holders.length} card holder(s) of {effectiveParty} — discount applies to their share.</p>
          </div>

          {holders.map((h, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Holder {i + 1}</span>
                {holders.length > 1 && (
                  <button onClick={() => removeHolder(i)} aria-label="Remove holder" className="text-muted-foreground hover:text-destructive cursor-pointer rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => update(i, { holderType: t })}
                    className={cn(
                      'rounded-lg py-1.5 text-[11px] font-medium border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      h.holderType === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {HOLDER_LABELS[t]}
                  </button>
                ))}
              </div>
              <Input value={h.holderName} onChange={e => update(i, { holderName: e.target.value })} placeholder="Holder name" className="h-9 text-sm" />
              <Input value={h.holderId} onChange={e => update(i, { holderId: e.target.value })} placeholder="ID No. (OSCA / PWD / Solo Parent)" className="h-9 text-sm" />
            </div>
          ))}

          <button onClick={addHolder} className="flex items-center gap-1 text-primary text-xs hover:bg-primary/5 rounded px-2 py-1.5 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="w-3.5 h-3.5" /> Add holder
          </button>

          <div className="flex gap-2 pt-1">
            {current && (
              <Button variant="secondary" className="flex-1" onClick={onRemove}>Remove</Button>
            )}
            <Button
              className="flex-[2]"
              disabled={!canApply}
              onClick={() => onApply({
                holders: holders.map(h => ({ holderType: h.holderType, holderName: h.holderName.trim(), holderId: h.holderId.trim() })),
                partySize: effectiveParty,
              })}
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

- [ ] **Step 3.2: Verify (web typecheck — will surface SalesPage breakage too, fixed in Task 4)**
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:web 2>&1 | grep -E "DiscountDialog" || echo "DiscountDialog clean"
```
Expected: `DiscountDialog clean` (SalesPage errors are expected until Task 4).

- [ ] **Step 3.3: Commit**
```bash
git add src/renderer/src/components/DiscountDialog.tsx
git commit -m "feat(discount): multi-holder panel with head count"
```

---

## Task 4: Wire SalesPage to multi-holder discount

**Files:** `src/renderer/src/pages/SalesPage.tsx`

Context: imports `DiscountDialog, { type Holder }` (line 6); `discount` state is `Holder | null` (line 20); `computeSale(... , discount?.holderType ?? null)` (lines 89-96); `discountLabel` (lines 98-99); the `<DiscountDialog .../>` usage (~lines 155-162) and `<CheckoutDialog holder={discount} .../>` (~line 149).

- [ ] **Step 4.1:** Change the import (line 6) from:
```ts
import DiscountDialog, { type Holder } from '@/components/DiscountDialog'
```
to:
```ts
import DiscountDialog from '@/components/DiscountDialog'
import type { PrivilegedDiscount } from '@/lib/discount'
```

- [ ] **Step 4.2:** Change the state (line 20) from:
```ts
  const [discount, setDiscount] = useState<Holder | null>(null)
```
to:
```ts
  const [discount, setDiscount] = useState<PrivilegedDiscount | null>(null)
```

- [ ] **Step 4.3:** Change the `computeSale` call (lines 89-96) — replace the last argument:
```ts
  const sale = computeSale(
    cart.map(i => ({
      lineTotal: Math.round(i.product.price * i.quantity * 100) / 100,
      vatType: i.product.vatType ?? 'VATABLE',
      scDiscountExempt: i.product.scDiscountExempt ?? false,
    })),
    discount?.holders ?? [],
    discount?.partySize ?? 1,
  )
```

- [ ] **Step 4.4:** Change `discountLabel` (lines 98-99). Replace:
```ts
  const discountLabel = discount
    ? `${HOLDER_LABELS[discount.holderType]} · ${discount.holderName} · ${discount.holderId}`
```
with a summary (keep whatever the rest of that ternary renders for the null case — typically `: null`):
```ts
  const discountLabel = discount
    ? `${discount.holders.length} holder(s) · party of ${discount.partySize}`
```
(`HOLDER_LABELS` may now be unused in SalesPage — if the typecheck flags it as unused, remove it from the `import { computeSale, HOLDER_LABELS } from '@/lib/discount'` line.)

- [ ] **Step 4.5:** Update the `<DiscountDialog .../>` usage. Its `onApply` now receives a `PrivilegedDiscount`:
```tsx
      {showDiscount && (
        <DiscountDialog
          current={discount}
          onApply={(d) => { setDiscount(d); setShowDiscount(false) }}
          onRemove={() => { setDiscount(null); setShowDiscount(false) }}
          onClose={() => setShowDiscount(false)}
        />
      )}
```

- [ ] **Step 4.6:** Update the `<CheckoutDialog ... />` prop — change `holder={discount}` to `discount={discount}`:
```tsx
        <CheckoutDialog
          cart={cart}
          customer={customer}
          total={total}
          sale={sale}
          discount={discount}
          onClose={() => setShowCheckout(false)}
          onSuccess={() => { clearCart(); setShowCheckout(false); setTimeout(focusSearch, 0) }}
        />
```

- [ ] **Step 4.7: Verify**
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:web 2>&1 | grep -E "SalesPage" || echo "SalesPage clean"
```
Expected: `SalesPage clean` (CheckoutDialog errors are expected until Task 5).

- [ ] **Step 4.8: Commit**
```bash
git add src/renderer/src/pages/SalesPage.tsx
git commit -m "feat(discount): thread multi-holder discount through SalesPage"
```

---

## Task 5: CheckoutDialog — send all holders + print two signed copies

**Files:** `src/renderer/src/components/CheckoutDialog.tsx`

Context: imports `type { SaleCalc, HolderType }` + `HOLDER_LABELS` (lines 14-15); the `holder` prop (line 41); posts `holders: holder ? [single] : []` + `partySize: 1` (lines 139-140); prints once via `printThermal({... holder: ... })` (lines 164-181).

- [ ] **Step 5.1:** Update imports. Replace line 14-15:
```ts
import type { SaleCalc, HolderType } from '@/lib/discount'
import { HOLDER_LABELS } from '@/lib/discount'
```
with:
```ts
import type { SaleCalc, PrivilegedDiscount } from '@/lib/discount'
import { printThermal } from '@/lib/escp'
```
(Note: `printThermal` is likely already imported at line 9 — if so, do NOT duplicate it; only swap the discount-type imports. `HOLDER_LABELS` is removed.)

- [ ] **Step 5.2:** Update the `holder` prop in the `Props` interface. Replace:
```ts
  holder: { holderType: HolderType; holderName: string; holderId: string } | null
```
with:
```ts
  discount: PrivilegedDiscount | null
```
And update the component signature destructure `({ cart, customer, total, sale, holder, onClose, onSuccess })` → replace `holder` with `discount`.

- [ ] **Step 5.3:** Update the `/api/sales` payload (lines 139-140). Replace:
```ts
          holders: holder ? [{ holderType: holder.holderType, holderName: holder.holderName, holderId: holder.holderId, sequence: 1 }] : [],
          partySize: 1,
```
with:
```ts
          holders: discount ? discount.holders.map((h, i) => ({ holderType: h.holderType, holderName: h.holderName, holderId: h.holderId, sequence: i + 1 })) : [],
          partySize: discount?.partySize ?? 1,
```

- [ ] **Step 5.4:** Replace the single `printThermal({ ... })` call (lines 164-181) with a helper that builds the base receipt once and prints two copies when a privileged discount is present. Replace the whole `await printThermal({ ... })` statement with:
```ts
        const holdersForReceipt = discount
          ? discount.holders.map(h => ({ type: h.holderType, name: h.holderName, id: h.holderId }))
          : undefined
        const baseReceipt = {
          invoiceNumber: data.invoiceNumber ?? data.invoice?.invoiceNumber ?? '',
          totalAmount: total,
          createdAt: data.createdAt ?? new Date().toISOString(),
          customer: customer ? { name: customer.name } : undefined,
          payments: receiptPayments,
          cashTendered: cashReceived > 0 ? cashReceived : undefined,
          change: changeDue > 0 ? changeDue : undefined,
          vat: sale.vat,
          discount: discount ? { label: 'Privileged Disc', amount: sale.discount + sale.vatExemptReduction } : undefined,
          holders: holdersForReceipt,
          details: cart.map(item => ({
            quantity: item.quantity,
            unitPrice: item.product.price,
            total: item.product.price * item.quantity,
            product: { name: item.product.name },
          })),
        }
        if (discount) {
          // Establishment copy (with signature lines), then customer copy (without).
          await printThermal({ ...baseReceipt, withSignature: true, copyLabel: '*** ESTABLISHMENT COPY ***' })
          await printThermal({ ...baseReceipt, withSignature: false, copyLabel: '*** CUSTOMER COPY ***' })
        } else {
          await printThermal(baseReceipt)
        }
```

- [ ] **Step 5.5: Verify**
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | tail -10
```
Expected: no errors (both `typecheck:node` and `typecheck:web` clean).

- [ ] **Step 5.6: Commit**
```bash
git add src/renderer/src/components/CheckoutDialog.tsx
git commit -m "feat(checkout): send all holders + print establishment/customer copies"
```

---

## Task 6: Full verification

**Files:** none

- [ ] **Step 6.1: Typecheck + unit tests**
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | tail -5
npx vitest run src/renderer/src/lib/__tests__/discount.test.ts 2>&1 | tail -6
```
Expected: typecheck clean; discount tests all pass. (The pre-existing `api.test.ts` failures are unrelated — do not fix here.)

- [ ] **Step 6.2: Reconciliation sanity check.** Confirm desktop `computeSale` equals the web server's `computeSaleTotals` for a representative input by hand: a cart of `vatable(112)` with `[SC, SC]` party 4 must yield `amountDue 96`, `discount 10`, `vatExemptReduction 6` (asserted in Task 1). This is the same formula `/api/sales` uses, so the booked total will match the charged total.

- [ ] **Step 6.3: Manual smoke (dev).**
```bash
npm run dev
```
- Build a cart with a VATABLE item and a liquor item flagged `scDiscountExempt` in product setup.
- Open the discount panel → add 2 SC holders (names + IDs), set head count 4 → preview shows the 20% on half the eligible VATABLE base, liquor excluded.
- Checkout → confirm the desktop total equals what the server books (no error from `/api/sales`), and **two receipts print**: the establishment copy has a `Signature: ____` line per holder and an `ESTABLISHMENT COPY` label; the customer copy has the holder names/IDs but no signature lines and a `CUSTOMER COPY` label.
- Repeat with a single Solo Parent holder (party 1) → 10% discount, still two copies.
- Remove the discount → single copy, no holder block (unchanged behavior).

- [ ] **Step 6.4: Final commit (if pending)**
```bash
git add -A && git commit -m "feat: desktop multi-holder statutory discount + signed two-copy receipt" || echo "nothing to commit"
```
