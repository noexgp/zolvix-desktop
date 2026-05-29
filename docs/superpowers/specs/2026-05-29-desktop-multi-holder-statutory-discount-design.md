# Desktop Multi-Holder Statutory Discount + Signed Two-Copy Receipt — Design Spec

**Date:** 2026-05-29
**Project:** Zolvix Desktop (Electron + React companion to the web POS)

## Problem

The desktop BIR discount supports only a **single** SC/PWD/Solo Parent holder per sale and prints **one** receipt. Two gaps:

1. A transaction may involve **multiple** SC/PWD/Solo Parent card holders, and BIR computes the discount on the holders' **proportionate share** of a shared bill (party size). The desktop can't capture multiple holders or a head count, so it can't compute or record this correctly.
2. For statutory-discount sales, the establishment must keep a **signed copy** as proof of the claim. The desktop prints a single copy with one generic signature line.

The web POS already supports multiple holders + party size and recomputes the discount server-side. The desktop posts to the same `/api/sales`, so it must match that model exactly to avoid over/under-collection.

## Scope

In scope (this spec — "Spec 1"):
- Multiple SC/PWD/Solo Parent holders + head count (party size) on the desktop, computed to match the web/server.
- Per-holder name + ID capture, printed on the receipt.
- Two receipt copies when **any** privileged discount (SC, PWD, or Solo Parent) is present: an establishment copy with per-holder signature lines, and a customer copy without.

Out of scope:
- **Manual line-item discount + multi-select bulk apply** — a separate future spec ("Spec 2"). Per the agreed rule, a sale will carry **either** a statutory discount **or** a line discount, never both; that mutual-exclusivity is enforced when Spec 2 is built (no line discount exists on desktop today, so Spec 1 has nothing to disable yet).
- Item eligibility stays **product-level** (the `scDiscountExempt` flag + `vatType`, already set per product and used by both desktop and server) — no per-sale item selection (Option A).
- No changes to the web app (it already supports holders[] + partySize; server recomputes from product flags).

## Feature 1 — Compute: multi-holder + party size

`src/renderer/src/lib/discount.ts` currently exports `computeSale(items, holderType: HolderType | null)`. Replace the single `holderType` with a holders array + party size, mirroring the web's `computePrivilegedDiscount` / `computeSaleTotals` (`zolvix/lib/discount.ts`) so desktop totals equal server totals.

New signature:
```ts
export interface Holder { holderType: HolderType; holderName: string; holderId: string }
export function computeSale(items: DiscountItem[], holders: Holder[], partySize: number): SaleCalc
```

Logic (party size = max(partySize, holders.length); fractions from holder counts):
- `scPwdCount` = holders with type SC or PWD; `spCount` = Solo Parent holders.
- `scPwdFraction = scPwdCount / partySize`, `spFraction = spCount / partySize`.
- Eligible = items where `!scDiscountExempt`. `vatableEligible` = eligible VATABLE line totals; `exemptEligible` = eligible EXEMPT/ZERO_RATED line totals.
- **SC/PWD:** `discount += (vatableEligible/1.12 + exemptEligible) × 0.20 × scPwdFraction`. VAT step-down: `vatExemptReduction += (vatableEligible − vatableEligible/1.12) × scPwdFraction` (the VAT removed from the eligible VATABLE share); correspondingly move `(vatableEligible/1.12) × scPwdFraction` of net sales from VATABLE to VAT-exempt and subtract `vatExemptReduction` from the VAT amount.
- **Solo Parent:** `discount += (vatableEligible + exemptEligible) × 0.10 × spFraction` (no VAT step-down).
- `amountDue = gross − discount − vatExemptReduction`.

`SaleCalc` shape is unchanged (`grossSubtotal`, `discount`, `vatExemptReduction`, `amountDue`, `vat`). With one holder and party size 1 this reduces to today's behavior. Update `src/renderer/src/lib/__tests__/discount.test.ts`: keep the single-holder cases (passing `[holder]`, partySize 1) and add multi-holder + party-size cases (e.g. 2 SC of party 4 → half the eligible base discounted).

## Feature 2 — Discount panel (multi-holder + head count)

Replace the single-holder `src/renderer/src/components/DiscountDialog.tsx` with a panel that captures:
- **Head count** (party size) — number input, **defaults to the number of holders**, min 1.
- **Holders** — an editable list; each row has **Type** (SC / PWD / Solo Parent), **Name**, **ID No.** Add/remove rows.
- **Live discount preview** computed via `computeSale`.
- **Validation:** ≥ 1 holder; every holder needs Name + ID; `holders.length ≤ headCount`. Apply is disabled until valid.

`SalesPage.tsx` state changes from `discount: Holder | null` to `discount: { holders: Holder[]; partySize: number } | null`. `computeSale` is called with `discount?.holders ?? []` and `discount?.partySize ?? 1`. The `discountLabel` becomes a short summary (e.g. `2 SC / 1 PWD · party of 4`), with full per-holder detail shown in the cart/checkout. `CartSidebar` keeps `discountLabel` + `discountAmount` (= `sale.discount + sale.vatExemptReduction`); `onOpenDiscount` / `onRemoveDiscount` unchanged.

## Feature 3 — Checkout payload

`src/renderer/src/components/CheckoutDialog.tsx` currently sends `holders: [single]` + `partySize: 1`. Change to send **all** holders and the real head count:
```ts
holders: discount ? discount.holders.map((h, i) => ({ holderType: h.holderType, holderName: h.holderName, holderId: h.holderId, sequence: i + 1 })) : [],
partySize: discount?.partySize ?? 1,
```
No other payload change. The server recomputes from these + product flags, so the booked total matches what `computeSale` charged.

## Feature 4 — Receipt: holders + two signed copies

`src/electron-main/escp-thermal.tsx` currently takes `holder?: { type; name; id }` and prints one block with a single `Signature: ____` line. Changes:

- Receipt data: replace `holder` with `holders?: Array<{ type: string; name: string; id: string }>`.
- Add a `withSignature: boolean` flag to the receipt build (and a `copyLabel` string, e.g. `ESTABLISHMENT COPY` / `CUSTOMER COPY`).
- When `holders` is non-empty:
  - Always print each holder's **Name** and **ID No.** (both copies).
  - On the **establishment copy** (`withSignature: true`): print a **`Signature: ____________`** line under each holder's name.
  - On the **customer copy** (`withSignature: false`): omit the signature lines.
  - Print a small `copyLabel` header so the two copies are distinguishable.

`CheckoutDialog` passes `holders` (mapped from `discount.holders`) to the receipt instead of `holder`. The print step calls the printer **twice** when a privileged discount is present — first the establishment copy (`withSignature: true`), then the customer copy (`withSignature: false`). When there is no privileged discount, print a single copy as today (no `copyLabel`, no signature section). `src/renderer/src/lib/escp.ts` `printThermal` gains the `withSignature` / `copyLabel` pass-through (or the caller invokes it twice with different flags).

## Error handling & edge cases

- Apply disabled until ≥1 valid holder (name + ID) and `holders.length ≤ headCount`.
- `partySize` is clamped to `max(partySize, holders.length)` in compute (defensive; the UI already enforces it).
- Removing the discount reverts to no-holder totals and a single receipt copy.
- A privileged discount and a (future) line discount are mutually exclusive — enforced in Spec 2.
- Two-copy printing applies to SC, PWD, **and** Solo Parent.

## Testing

- **Unit (`discount.test.ts`):** keep single-holder cases; add: 2 SC of party 4 (half base), 1 SC + 1 SP of party 2, all-exempt cart, `scDiscountExempt` excluded. Assert `discount`, `vatExemptReduction`, `amountDue`, and the VAT split — and that these equal the web `computeSaleTotals` for the same inputs (reconciliation).
- **Manual smoke:** ring up a mixed cart with a VATABLE item + a liquor item flagged `scDiscountExempt`; add 2 SC holders, head count 4; confirm the 20% applies to half the eligible (VATABLE) base, liquor is excluded, and the desktop total equals what the server books. Confirm two copies print — establishment copy has a signature line per holder, customer copy has none; Solo Parent behaves the same.
