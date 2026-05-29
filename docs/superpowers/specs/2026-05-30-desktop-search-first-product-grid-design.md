# Desktop Search-First Product Grid (Top Sellers Default + Server-Side Search) — Design Spec

**Date:** 2026-05-30
**Project:** Zolvix Desktop (`zolvix-desktop`)

## Problem

The desktop sales screen renders **every product** in its locally-cached set into the DOM at once (`filtered.map(...)` in `src/renderer/src/components/ProductGrid.tsx`). The startup load also caps the cached catalog at `/api/products?limit=500` (`src/renderer/src/App.tsx:134`). Two consequences for any non-trivial catalog (e.g. ~5,500 products on the Galaxy Motors deployment):

1. **Display clutter / sluggishness** — hundreds of product cards on screen at idle.
2. **Missing products** — anything beyond the first 500 is invisible to the cashier.

## Scope

In scope (v1):
- Move the grid to a **search-first** model on the desktop, driven by the existing server endpoint `/api/product/cart`:
  - Empty search → fetch & render the server's **top sellers** via `GET /api/product/cart?topSellers=true` (the endpoint returns the top 30 by sold quantity, cached server-side for 5 minutes).
  - Typed search → debounced `GET /api/product/cart?q=<text>` (the server matches name, SKU, brand, and barcode in this endpoint, cached for 30 s, capped at 30 results).
- Show a small **loading indicator** during fetches.
- **Offline fallback** to filtering the locally-cached `db.products` on network/server error.
- Keep the existing **category filter** as a client-side overlay on whatever set is currently rendered.
- Preserve the **keyboard navigation** (arrow keys + Enter to add).

Out of scope (parked as "improve later"):
- Virtualization of the grid.
- Local fulltext index (e.g. MiniSearch over cached products) for richer offline search.
- Raising/removing the `?limit=500` startup cache cap.
- Server-side Redis cache configuration (works without it; cache kicks in when configured).
- Barcode auto-add on exact-match.

## Architecture

A single small hook owns the fetch state for the grid; `SalesPage` swaps its source of products from the local cache to the hook; `ProductGrid` is unchanged except for accepting an optional `loading` flag.

- **`src/renderer/src/hooks/useSalesProducts.ts` (new):** owns the debounced search query, the fetch lifecycle (`AbortController` to cancel stale requests on each keystroke), the `loading`/`error` flags, and the resulting `products` list. Calls `apiFetch('/api/product/cart?' + (q ? 'q=' + encodeURIComponent(q) : 'topSellers=true'))`. On error, falls back to filtering `db.products` (case-insensitive name/sku contains). On empty search the fallback returns the first 30 cached products sorted by name.
- **`src/renderer/src/pages/SalesPage.tsx`:** replaces the existing `db.products.toArray()` source for `products` with the hook's `products`. The hook is given the current `search` text (lifted up from `ProductGrid` or owned in `SalesPage`; see below). The cached `db.products` loader stays (it's the hook's offline fallback, and `addToCart` etc. still benefit from cached lookups).
- **`src/renderer/src/components/ProductGrid.tsx`:** accepts a new optional `loading?: boolean` prop and renders a small spinner near the search field when true; rendering otherwise unchanged. The internal `search` state moves up to `SalesPage` so the hook can see it (the simplest contract: `<ProductGrid products={products} loading={loading} search={search} onSearchChange={setSearch} ... />`).

### Data flow

```
              search='' (default / cleared)
SalesPage ──► useSalesProducts ──► GET /api/product/cart?topSellers=true ──► top 30 sellers
                                              │
                                              ▼ on error
                                       db.products (offline fallback)

              search='abc' (after 250 ms debounce, prior request aborted)
SalesPage ──► useSalesProducts ──► GET /api/product/cart?q=abc  ──► results
                                              │
                                              ▼ on error
                                       db.products.filter(name/sku contains)
```

`category` is applied **client-side** in `ProductGrid` on top of whatever the hook returned (unchanged).

## Components

| File | Action |
|------|--------|
| `src/renderer/src/hooks/useSalesProducts.ts` | new — debounced fetch + abort + loading/error + offline fallback |
| `src/renderer/src/pages/SalesPage.tsx` | source `products` from the hook; lift `search` state up; pass `loading` to grid |
| `src/renderer/src/components/ProductGrid.tsx` | accept `loading?` + `search`/`onSearchChange` props; render a spinner during fetch |

The startup `/api/products?limit=500` cache (`App.tsx`) and the IndexedDB `db.products` store are unchanged — they remain the offline fallback and the lookup cache for things like `addToCart`.

## Error handling & edge cases

- `AbortError` on rapid re-typing → ignored (no error UI, the new request takes over).
- Network/server error → log to console; fall back to filtering `db.products`; on the empty-search path that yields the cached list (sorted by name); on the search path, the filtered cache. Optional small "Offline — showing cached" hint (UI nicety, low priority).
- Empty results → existing "No products found" empty state in `ProductGrid` is preserved.
- Debounce: 250 ms (matches the existing pattern elsewhere in the apps).

## Testing

- **Unit (pure helpers):** extract the URL builder (`buildProductSearchUrl(q?: string)`) and the offline fallback filter (`fallbackFilter(cached, q)`) and unit-test those — fast, deterministic. The debounce/abort logic itself is not unit-tested in v1; verified by smoke.
- **Manual smoke:**
  - With the app online: open Sales → top sellers appear at idle → type a query → debounced results replace the grid → clear the search → top sellers reappear. Keyboard arrow + Enter adds the highlighted product.
  - Offline (disconnect): type a query → the cached fallback set shows.
  - Category filter still works on top of either set.

## Out of scope / future improvements (parked)

1. Top sellers / recent items improvements when offline (e.g. track a small "recents" list in IndexedDB).
2. **Virtualization** when a single search returns many hundreds of results.
3. **Local fulltext index** (MiniSearch / Dexie) for fast offline search across the whole cached catalog.
4. **Raise/remove** the `?limit=500` startup cache cap.
5. **Server-side Redis cache** for `/api/product/cart` — config-only when ready, no code change.
6. **Barcode auto-add** — exact-match SKU/barcode in the search box auto-adds to cart on Enter.
