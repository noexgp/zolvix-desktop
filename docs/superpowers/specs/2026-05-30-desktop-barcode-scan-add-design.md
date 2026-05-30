# Desktop Barcode/SKU Scan-to-Add (Enter Exact Match) — Design Spec

**Date:** 2026-05-30
**Project:** Zolvix Desktop (`zolvix-desktop`)

## Problem

The desktop sales screen now uses the **search-first** product grid: typing into the search box fires a 250 ms debounced server search (`useSalesProducts`). A hardware barcode scanner sends the whole code as fast keystrokes ending with **Enter** — but Enter fires **before** the debounced search settles, so the existing Enter handler (`filtered[highlight]` in `ProductGrid.tsx`) ends up adding whatever was highlighted from the *previous* result set (often the wrong item, or nothing). For a POS this is unacceptable: the cashier expects scan → product added.

## Scope

In scope:
- Make **Enter** in the search box do an immediate exact-match lookup whenever the text looks like a single-token code (no whitespace), bypassing the debounce. On a hit, add to cart, clear the input, refocus.
- Fall back gracefully (offline → cached lookup; not found → existing highlight-Enter behavior).

Out of scope:
- A dedicated "scanner mode" toggle/UI.
- A configurable setting (always-scan vs no-spaces vs length-based).
- Beeps, vibration, or other scanner feedback beyond the standard cart-add.
- Multi-word "first server match on Enter" — typed names keep the existing highlight-Enter behavior.

## Key decisions

- **Gate by whitespace.** Enter triggers the scan path only when the trimmed search text contains **no whitespace** (single token). Barcodes and SKUs are always single tokens; product names usually have spaces. This keeps the existing keyboard-arrow + Enter flow intact for typed names.
- **Endpoint.** Reuse the existing `GET /api/product/scan?q=<text>` (`/Users/glenn/dev/zolvix/app/api/product/scan/route.ts`), which already checks **exact barcode → exact SKU → name-contains** and returns one product. The server response uses the same nested `category: { id, name }` shape that the search hook already flattens, so we reuse that helper.
- **Strict accept.** On a server hit, only treat the result as a real scan match if `product.barcode === q` OR `product.sku === q`. This blocks the server's name-contains fallback from quietly auto-adding a partial-name match when a code didn't actually exist. If the strict check fails, treat it as "not found" and fall through to the next step.
- **Offline fallback.** On request error or non-OK / strict-reject, query `db.products` for an exact `barcode === q` or `sku === q` match before giving up. Mirrors the search-first hook's offline behavior.
- **Final fallback.** If neither server nor cache yields a strict match, do exactly what Enter does today: add `filtered[highlight]` if any.

## Formulas / Rules

`q = search.trim()`. `isLikelyCode(q) = q.length > 0 && !/\s/.test(q)`.

Enter handler (search input focused, key === 'Enter'):
```
if (!q)                       → do nothing
if (isLikelyCode(q)):
  product ← scanProduct(q)    // server: GET /api/product/scan?q=...
                              // strict accept (barcode === q || sku === q)
                              // on error/reject → local lookup over db.products
  if (product):               → onAddToCart(flatten(product)); onSearchChange(''); refocus; return
  // else fall through
if (filtered[highlight])      → onAddToCart(filtered[highlight])
```

## Components

| File | Action |
|------|--------|
| `src/renderer/src/hooks/useSalesProducts.ts` | export `flatten` (already used internally); add `isLikelyCode(q)` and `scanProduct(q): Promise<CachedProduct \| null>` |
| `src/renderer/src/hooks/__tests__/useSalesProducts.test.ts` | tests for `isLikelyCode` |
| `src/renderer/src/components/ProductGrid.tsx` | in the search input's `onKeyDown` Enter branch, `await scanProduct(q)` when `isLikelyCode(q)` is true; on a hit, add + clear + refocus; otherwise fall through to today's behavior |

No new endpoints, no schema changes, no settings.

## Data flow

```
keystroke → onSearchChange → useSalesProducts (debounced) → grid updates eventually
                                                              ▲
                                                              │ (independent path)
Enter on single-token q
   │
   ▼
scanProduct(q)
   ├─► apiFetch('/api/product/scan?q=' + encoded) ── 200 + strict match? → onAddToCart + clear + refocus
   │                                              ── 404 / strict reject / error
   ▼
   db.products.toArray() → first p where p.isActive && (p.barcode === q || p.sku === q)
   ├─► hit  → onAddToCart + clear + refocus
   └─► miss → fall through to filtered[highlight] (existing)
```

## Error handling & edge cases

- Empty `q` → Enter does nothing (unchanged).
- Multi-word `q` → Enter adds highlighted (unchanged).
- `/api/product/scan` 404 / non-OK / network error → offline fallback path.
- Strict reject (server returned a name-contains, not a real barcode/SKU match) → offline fallback path.
- Refocus uses the existing `searchRef`; the search input is already controlled by the parent.
- Clearing the search after a successful scan triggers the debounced top-sellers fetch (search is now empty) — that's fine and expected (returns the grid to its idle state).
- A second scan fired before the first completes: the second one's `await scanProduct` runs after the first resolved/added, so no race; even if it raced, both adds are valid product additions to the cart.

## Testing

- **Unit (pure):** `isLikelyCode` — empty, single token, with leading/trailing spaces (`.trim()` upstream), embedded space, single char, long all-digits. Fast and deterministic.
- **Manual smoke:**
  - Type a real SKU or barcode and press Enter (or scan with hardware) → product added, search cleared, input focused.
  - Type a barcode that doesn't exist → no add, search stays (or Enter falls through to highlighted if any).
  - Disconnect network → scan a cached barcode → still adds (offline fallback hit).
  - Type a name like `red shirt` + Enter → existing highlight-Enter behavior (unchanged).
  - Type a single word that's a substring of a product name but isn't an actual SKU/barcode (e.g. `shoe`) → strict accept blocks it; Enter falls through to the highlighted card.
