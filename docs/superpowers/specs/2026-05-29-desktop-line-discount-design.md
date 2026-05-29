# Desktop Line Discount (peso/percent, gated by Business Setting) — Design Spec

**Date:** 2026-05-29
**Projects:** Zolvix Desktop (primary) + Zolvix web (`/Users/glenn/dev/zolvix`, for the Business Setting)

## Problem

The desktop sales screen has no manual/promotional discount — only the statutory SC/PWD/Solo Parent discount. The owner wants a **line discount**: select one or more cart lines and apply a discount, entered as **either pesos or a percent**, normalized and stored as a **percent**. It must be gated by a Business Setting (off by default) and be **mutually exclusive** with the statutory discount on the same sale. ("Spec 2"; "Spec 1" — multi-holder statutory discount — already shipped.)

## Scope

In scope:
- **Web:** add `enableLineDiscount` to `BusinessSetting` (+ migration), the settings form toggle, and `/api/settings/business` GET/PATCH.
- **Desktop:** read the setting (via the existing `/api/settings/business` → `birConfig` flow); cart multi-select + an "apply discount to selected" control (₱ or %); store/send the line discount as a percent at 4 decimal places; feed the discounted line totals into `computeSale`; show the per-line discount on the receipt; enforce mutual exclusivity with the statutory discount.

Out of scope:
- A **max-% cap** on line discounts (future enhancement).
- The **web POS** — it already has its own per-item discount mechanics; this spec only adds the `enableLineDiscount` setting on the web side, not a web POS line-discount UI.
- Editing/voiding a discount after the sale is committed.

## Key decisions

- **Stored & sent as percent, rounded to 4 decimals.** The server's invoice line-item `discount` column is already `Decimal(65, 4)`, so no web migration is needed for precision. Sending the percent at 4 dp avoids centavo drift on peso-entered discounts.
- **Sale-level `discountMode: 'PERCENT'`.** Because both peso and percent inputs normalize to a per-line percent, the whole sale uses one mode — peso and percent lines coexist without conflict, and the server (`calcLineTotal(..., 'PERCENT')`) books `lineGross × (1 − pct/100)` identically to the desktop.
- **Mutual exclusivity.** A sale carries the statutory discount OR line discounts, never both — enforced in the UI.

## Formulas

Rounding: `round4(x) = Math.round(x*10000)/10000` (percent), `round2(x) = Math.round(x*100)/100` (currency). `lineGross = unitPrice × qty`.

1. **Input → stored percent (per line):**
   - Percent input `p`: `pct = round4(clamp(p, 0, 100))`.
   - Peso input `d`: `pct = round4(min(100, (d / lineGross) × 100))`.
   - Bulk apply runs this per selected line independently (a peso amount converts to each line's own percent).
2. **Discounted line total** (feeds `computeSale`, VAT, receipt):
   - `lineDiscountAmount = round2(lineGross × pct / 100)`
   - `lineNet = round2(lineGross − lineDiscountAmount)` (= `round2(lineGross × (1 − pct/100))`)
3. **VAT split** (line-discount sale has no statutory holder → `computeSale` is called with `holders: []`, so its discount/vatExemptReduction branch is skipped): each line contributes `lineNet` to its vatType bucket (VATABLE → net `lineNet/1.12` + VAT `lineNet − lineNet/1.12`; EXEMPT/ZERO_RATED → face). `amountDue = Σ lineNet`.
4. **Payload per cart line:** `discount: pct` (4 dp) with sale-level `discountMode: 'PERCENT'`.

Example: ₱50 off a ₱150 line → `pct = 33.3333` → `lineNet = round2(150 × 0.666667) = 100.00` → ₱50.00 discount, no drift.

## Data flow

`BusinessSetting.enableLineDiscount` (web DB) → `/api/settings/business` GET → desktop `App.tsx` caches it into `birConfig` (electron-store) → `SalesPage` reads it and shows the line-discount controls only when `true`.

## Components

### Web (`/Users/glenn/dev/zolvix`)
- `prisma/schema.prisma`: `enableLineDiscount Boolean @default(false)` on `BusinessSetting` (+ migration).
- `lib/validation.ts`: add `enableLineDiscount` to `BusinessSettingsSchema`.
- `app/api/settings/business/route.ts`: return it in GET (authed + default-row responses), accept/persist in PATCH, return in PATCH response.
- `app/admin/settings/business/BusinessSettingsForm.tsx`: an "Enable line discount" toggle (mirrors the existing workflow toggles); helper text e.g. "Allow cashiers to apply per-line promotional discounts in the desktop POS."

### Desktop (`/Users/glenn/dev/zolvix-desktop`)
- **`src/renderer/src/App.tsx`**: include `enableLineDiscount` when fetching `/api/settings/business` and caching to `birConfig`.
- **Cart model (`src/renderer/src/lib/cart.ts` / `CartItem`)**: add an optional `discountPct?: number` (percent, 4 dp) per line. The existing `lineTotal()` helper (or a new `lineNet()`) yields the discounted net.
- **`src/renderer/src/components/CartSidebar.tsx`**: when line discount is enabled and no statutory discount is active — allow selecting lines (e.g. a checkbox per line) and show a small discount bar: a ₱/% toggle, a value input, and "Apply to selected"; show each line's discount + a clear (×). Disabled when a statutory discount is set.
- **`src/renderer/src/pages/SalesPage.tsx`**: hold `lineDiscounts` (or store `discountPct` on cart items); compute each line's `lineNet` and pass that as `lineTotal` to `computeSale` (holders stay `[]` when line discounts are present); compute total line-discount savings for display. Enforce mutual exclusivity: if any line has a discount, disable/clear the statutory Discount button; if a statutory holder is set, disable the line-discount controls. Read `enableLineDiscount` from the cached settings to gate the whole feature.
- **`src/renderer/src/components/CheckoutDialog.tsx`**: in the `/api/sales` cart payload, send each line's `discount: discountPct ?? 0` and the sale-level `discountMode: 'PERCENT'` (replacing the hardcoded `discount: 0` / `discountMode: 'PERCENT'`). Pass per-line discount into the receipt details.
- **`src/electron-main/escp-thermal.tsx`**: receipt `details` rows show the line discount (e.g. a `-₱X.XX (pct%)` under the line, and/or the discounted line total).

## Error handling & edge cases

- `pct` clamped to `[0, 100]`; a peso amount ≥ lineGross caps at 100% (whole line free).
- Clearing a line's discount sets `discountPct` to 0/undefined.
- Mutual exclusivity is enforced both ways (statutory set ⇒ line controls disabled; any line discount ⇒ statutory disabled).
- If `enableLineDiscount` is false (or unknown/offline with no cached value), the line-discount UI is hidden entirely — existing behavior preserved.

## Testing

- **Desktop unit:** a pure helper (e.g. `lineDiscountPct(mode, value, lineGross)` → percent at 4 dp; and `lineNet(lineGross, pct)` → currency at 2 dp). Tests: percent input clamps to 100; peso input converts (₱50/₱150 → 33.3333, lineNet 100.00); peso ≥ gross caps at 100%; 0/empty → no discount. `computeSale` already tested — line discounts only change the input line totals.
- **Web:** `enableLineDiscount` round-trips through the settings GET/PATCH (follow the existing settings-field test pattern; if none, manual smoke).
- **Manual smoke:** with the setting on, select 2 of 3 cart lines, apply 10% → both show the discount, totals/VAT reflect the discounted nets; enter ₱50 on a ₱150 line → shows 33.3333%/₱50 off; checkout → the server books the same total (no error); receipt shows per-line discounts. Confirm a statutory discount disables line-discount controls and vice versa. With the setting off, no line-discount UI appears.
