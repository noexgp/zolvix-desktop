# BIR Discount Module — Design Spec
**Date:** 2026-05-28
**Project:** Zolvix Desktop (Electron + React + TypeScript)
**Builds on:** the POS sales screen (`SalesPage`, `CartSidebar`, `CheckoutDialog`, `lib/cart.ts`, `escp-thermal.tsx`)

---

## Overview

Add BIR-mandated privileged discounting to the desktop POS: **Senior Citizen (SC)**, **PWD**, and **Solo Parent (SP)**. A single holder per sale (v1). The discount is invoice-level, applied in the cart so the customer-facing Amount Due banner shows the net total before payment. Per-item VAT classification (`VATABLE` / `EXEMPT` / `ZERO_RATED`) is also added so the VAT breakdown and the discount's VAT exemption are accurate. The server's `/api/sales` endpoint already accepts `holders` + `partySize` and recomputes authoritatively; the desktop computes locally for display and to charge the correct amount.

---

## Discount & VAT math (`lib/discount.ts` — new, pure, tested)

Values for `vatType`: `VATABLE` (default), `EXEMPT`, `ZERO_RATED`.

```ts
type HolderType = 'SC' | 'PWD' | 'SOLO_PARENT'

interface DiscountItem {
  lineTotal: number          // unit price × qty (VAT-inclusive)
  vatType: string            // VATABLE | EXEMPT | ZERO_RATED
  scDiscountExempt: boolean   // product flagged not eligible for SC/PWD/SP discount
}

interface VatBreakdown {
  vatableSales: number       // net of VAT (sum of VATABLE lineTotal / 1.12)
  vatAmount: number          // 12% on VATABLE
  vatExemptSales: number     // sum of EXEMPT lineTotal
  zeroRatedSales: number     // sum of ZERO_RATED lineTotal
}

interface SaleCalc {
  grossSubtotal: number      // sum of all lineTotals
  discount: number           // peso amount taken off
  vatExemptReduction: number // VAT removed from the SC/PWD-eligible portion (0 for SP)
  amountDue: number          // gross − vatExemptReduction − discount
  vat: VatBreakdown          // VAT breakdown AFTER discount treatment
}

// Single entry point used by SalesPage:
computeSale(items: DiscountItem[], holderType: HolderType | null): SaleCalc
```

**VAT classification** (always, even with no discount):
- `EXEMPT` line → `vatExemptSales += lineTotal`
- `ZERO_RATED` line → `zeroRatedSales += lineTotal`
- else → `vatableSales += lineTotal / 1.12`; `vatAmount += lineTotal − lineTotal/1.12`

**SC / PWD** (20% + VAT exemption on the eligible portion):
- `eligibleBase` = sum of lineTotals that are `VATABLE` **and** not `scDiscountExempt`
- `netBase = eligibleBase / 1.12`
- `vatExemptReduction = eligibleBase − netBase`  (the 12% VAT removed)
- `discount = netBase × 0.20`
- The eligible portion moves from VATable → VAT-Exempt in the breakdown.

**Solo Parent** (10% off gross, no VAT exemption — matches web behavior):
- `eligibleGross` = sum of lineTotals not `scDiscountExempt`
- `discount = eligibleGross × 0.10`
- `vatExemptReduction = 0`; VAT breakdown unchanged.

**Amount due** = `grossSubtotal − vatExemptReduction − discount`.

No holder → `discount = 0`, `vatExemptReduction = 0`, `amountDue = grossSubtotal`, plain per-item VAT breakdown.

### Unit tests (`lib/__tests__/discount.test.ts`)
- VATABLE-only cart, no holder → vatable = total/1.12, vat = remainder.
- Mixed VATABLE + EXEMPT + ZERO_RATED → correct three-way split.
- SC on all-VATABLE → discount = (total/1.12)×0.20; amountDue = total − vatRemoved − discount.
- SC with one `scDiscountExempt` item → that item excluded from eligibleBase, still charged full.
- Solo Parent → 10% off gross, VAT breakdown unchanged.
- EXEMPT item with SC holder → not double-discounted on VAT (already exempt, not in eligibleBase).

---

## Data & caching

**`CachedProduct`** (in `lib/db.ts`) gains:
- `vatType?: string` (already declared) — ensure captured in **both** cache writers.
- `scDiscountExempt?: boolean` — new.

Both cache-write paths must set them:
- `App.tsx` background refresh — add `scDiscountExempt: p.scDiscountExempt ?? false` (already sets `vatType`).
- `ProductsPage.tsx` — add `vatType: p.vatType ?? 'VATABLE'` and `scDiscountExempt: p.scDiscountExempt ?? false` (currently sets neither).

The product API returns both fields via object spread.

---

## State (`SalesPage`)

New state:
```ts
const [discount, setDiscount] = useState<{ holderType: HolderType; holderName: string; holderId: string } | null>(null)
```
- Cleared in `clearCart()`.
- `SalesPage` computes `const calc = computeSale(cart, discount?.holderType ?? null)` → `{ amountDue, discount, vat, ... }`.
- Passes `amountDue` (not raw cartTotal) as `total` to `CartSidebar` and `CheckoutDialog`, plus the `discount`/holder info and `vat` breakdown for display + receipt.

---

## UI

**`CartSidebar` footer** — a compact discount control above the Hold/Checkout row:
- If no discount: a button **"+ SC / PWD / Solo Parent"**.
- If active: a chip showing `SC · Juan D. · ID-123  −₱32.14` with a ✕ to remove.
- The **Amount Due banner** reflects `amountDue` (discounted).

**`DiscountDialog`** (new component `components/DiscountDialog.tsx`):
- Segmented control: Senior Citizen / PWD / Solo Parent.
- Inputs: **Holder Name**, **ID No.** (OSCA / PWD / Solo Parent ID).
- Live preview of the computed discount and new total.
- **Apply** (requires name + ID) / **Cancel**. If a discount already exists, an **Remove** action.

---

## Checkout & API

`CheckoutDialog` already receives `total` (now the discounted `amountDue`). On submit it adds to the `/api/sales` payload:
```ts
holders: discount ? [{ holderType: discount.holderType, holderName: discount.holderName, holderId: discount.holderId, sequence: 1 }] : [],
partySize: 1,
```
(The other fields — cart, payments, globalDiscount:0, discountMode, etc. — stay as today.)

---

## Receipt (`escp-thermal.tsx`)

`ThermalInvoiceData` gains optional:
```ts
vat?: { vatableSales: number; vatAmount: number; vatExemptSales: number; zeroRatedSales: number }
discount?: { label: string; amount: number }            // e.g. "SC Disc (20%)"
holder?: { type: string; name: string; id: string }
```

Rendering changes:
- **VAT breakdown** uses the passed `vat` object (real per-item split) instead of deriving from total. Falls back to the current `total/1.12` derivation when `vat` is absent (e.g. reprints without breakdown data).
- When `discount` present: a `Less: <label>  −amount` line above TOTAL AMOUNT DUE.
- When `holder` present: a holder block in the footer —
  ```
  SC/PWD/SP Name : Juan Dela Cruz
  OSCA/PWD ID    : ID-123
  Signature      : ____________________
  ```

`CheckoutDialog` builds these from the sale calc and passes them to `printThermal`.

---

## File map

| File | Action |
|------|--------|
| `lib/discount.ts` | Create — `computeSale()` / VAT + discount math |
| `lib/__tests__/discount.test.ts` | Create — unit tests |
| `lib/db.ts` | Modify — add `scDiscountExempt` to `CachedProduct` |
| `App.tsx` | Modify — cache `scDiscountExempt` |
| `pages/ProductsPage.tsx` | Modify — cache `vatType` + `scDiscountExempt` |
| `pages/SalesPage.tsx` | Modify — discount state, compute sale, pass down |
| `components/DiscountDialog.tsx` | Create — holder picker |
| `components/CartSidebar.tsx` | Modify — discount control + chip |
| `components/CheckoutDialog.tsx` | Modify — holders/partySize in payload; pass vat/discount/holder to receipt |
| `electron-main/escp-thermal.tsx` | Modify — vat breakdown, discount line, holder block |

---

## Out of scope (v1)
- Multi-holder group splitting / party size > 1 (single holder only).
- Athlete/National Athlete discount (legacy per-item path).
- Editing rates in the desktop (SC/PWD 20%, SP 10% are fixed constants; web is source of truth for the server-side recompute).
