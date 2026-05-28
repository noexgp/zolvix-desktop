# Sales Screen — Design Spec
**Date:** 2026-05-28  
**Project:** Zolvix Desktop (Electron + React + TypeScript)  
**Approach:** Build fresh using existing Tailwind/shadcn design system and Dexie.js product cache

---

## Overview

A full POS sales screen for the Zolvix Desktop app, matching the visual style of the Zolvix web app (same color tokens, light/dark mode). Connects to the same `/api/sales` endpoint used by the web app. Designed for single-monitor setups where the cashier and customer share the same screen.

---

## Layout

```
┌─────────────────────────────────┬──────────────┐
│  Search bar         F1 Customer │  Amount Due  │  ← top bar
├─────────────────────────────────│  ₱ 180.00    │
│  Category tabs (scrollable)     │  Walk-in·3   │
├─────────────────────────────────├──────────────┤
│                                 │  Cart  [Clr] │
│   Product Grid (4 columns)      ├──────────────┤
│   [ card ][ card ][ card ][ ]   │  Item 1      │
│   [ card ][ card ][ card ][ ]   │  Item 2      │
│   [ card ][ card ][ card ][ ]   │  Item 3      │
│                                 │              │
│   flex: 3  (75% of width)       │  flex: 1     │
│                                 │  (25% width) │
│                                 ├──────────────┤
│                                 │[Hold F2][Chk]│
└─────────────────────────────────┴──────────────┘
```

- **Left (flex:3):** product area — search + category tabs + 4-column product grid
- **Right (flex:1):** cart — large total banner + cart items + Hold/Checkout footer
- Responsive to window width; minimum usable width ~900px

---

## Components

### 1. `SalesPage.tsx`
Route: `/sales`  
Top-level state owner. Manages: cart items, selected customer, checkout dialog visibility, hold dialog.  
Added to sidebar nav under a new **POS** group.

### 2. `ProductGrid.tsx`
- Loads products from Dexie.js (`db.products`) — already cached in background refresh
- Category tabs from unique `categoryId` values; "All" tab shows everything
- Search filters by name, SKU, barcode in real time (client-side, no API call)
- 4-column CSS grid, each card shows: placeholder icon area, name, price
- **In cart** badge (purple) when product is already in cart
- **Out of stock** overlay + disabled click when `stock === 0`
- Click adds 1 to cart; if already in cart, increments quantity

### 3. `CartSidebar.tsx`

**Total banner (top):**
- Blue-to-purple gradient background
- "Amount Due" label (small, uppercase, letter-spaced)
- Total in large white bold font (32px+) — customer-visible
- Customer name + item count subtitle

**Cart item rows:**
- Item name + line total (right)
- − / qty / + controls + unit price label + ✕ remove
- Scrollable list

**Footer:**
- `[Hold  F2]` (flex:1, muted) + `[Checkout  F3 →]` (flex:2, purple) — side by side
- Hold disabled when cart is empty

### 4. `CheckoutDialog.tsx`
Full-screen modal triggered by Checkout button or F3.

**Payment methods:** Cash, Card, E-wallet, Check, Charge, Gift Certificate  
- Match web app method tabs exactly
- Card: provider selector (Visa, Mastercard, Amex, etc.) + approval code
- E-wallet: provider selector (GCash, Maya, etc.) + reference no
- Check: check number, bank, date, payor name
- Charge: customer required, terms (days)
- GC: certificate code + validation

**Split payment:** "Add Payment" adds another payment row. Remaining balance shown. Checkout enabled when remaining = 0.

**Cash:** tendered amount input → change calculated and shown in green.

**On confirm:** POST `/api/sales` with cart + payments payload → show change dialog if cash → print receipt to configured POS printer → clear cart.

---

## Data Flow

```
Dexie products cache → ProductGrid (filter/display)
                           ↓ click
                       SalesPage cart state
                           ↓
                       CartSidebar (display + edit)
                           ↓ Checkout F3
                       CheckoutDialog
                           ↓ confirm
                       POST /api/sales
                           ↓ success
                       print receipt (thermal)
                       clear cart
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F1  | Set customer to Walk-in / open customer picker |
| F2  | Hold current cart (opens hold dialog) |
| F3  | Open checkout dialog |
| Esc | Close any open dialog |

---

## API Integration

**POST `/api/sales`** — same payload as the web app:
```ts
{
  customerId?: string           // undefined = walk-in
  cart: CartItem[]
  payments: PaymentEntry[]
  globalDiscount: 0
  discountMode: 'PERCENT'
  deliveryFee: 0
  withholdingTax: 0
  ewtMode: 'DEDUCT'
  holders: []
  partySize: 1
  notes?: string
}
```

Returns `{ invoiceId, invoiceNumber, createdAt }` → used for receipt printing.

---

## Theming

Uses existing CSS custom properties from the desktop app (`bg-background`, `bg-card`, `text-foreground`, `border-border`, `primary`, etc.). Light/dark toggle already wired in the sidebar — no additional work needed.

---

## Out of Scope (v1)

- Modifiers / combo items
- SC/PWD privileged discounts
- Table management
- Open tickets / hold order recall (hold saves but recall is v2)
- Offline sale queuing (can add later using existing Dexie infrastructure)
