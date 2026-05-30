# Desktop Search-First Product Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Zolvix Desktop product grid to a server-driven search-first model — top sellers as the default, debounced server search on typing, loading indicator, offline fallback to the cached IndexedDB products.

**Architecture:** A small `useSalesProducts({ search })` hook owns the debounced fetch against `/api/product/cart` (`?topSellers=true` when empty, `?q=<text>` when typing) and the offline fallback to `db.products`. `SalesPage` lifts the `search` state up and feeds the hook; `ProductGrid` becomes controlled (receives `search`/`onSearchChange`/`loading`) and drops the per-keystroke client-side name/sku filter (server does it). Category filtering stays client-side as a visual overlay.

**Tech Stack:** Electron + React + TS (renderer), Vitest, IndexedDB via Dexie (`@/lib/db`), `apiFetch` IPC bridge.

**Spec:** `docs/superpowers/specs/2026-05-30-desktop-search-first-product-grid-design.md`

---

## File Map

| File | Action |
|------|--------|
| `src/renderer/src/hooks/useSalesProducts.ts` | new — `buildProductSearchUrl`, `fallbackFilter`, `useSalesProducts({ search })` |
| `src/renderer/src/hooks/__tests__/useSalesProducts.test.ts` | new — tests for the two pure helpers |
| `src/renderer/src/components/ProductGrid.tsx` | controlled `search`/`onSearchChange`, `loading` prop + spinner, drop the per-keystroke search filter |
| `src/renderer/src/pages/SalesPage.tsx` | lift `search` state, consume the hook, pass props to ProductGrid; remove the now-unused local `products` state if nothing else references it |

`App.tsx` startup `?limit=500` cache is unchanged — it remains the offline fallback set in `db.products`.

---

## Task 1: hook + pure-helper tests (TDD)

**Files:** `src/renderer/src/hooks/useSalesProducts.ts` (new), `src/renderer/src/hooks/__tests__/useSalesProducts.test.ts` (new)

Note on IPC `AbortSignal`: the desktop's `apiFetch` routes through `window.electron.api.fetch` (IPC), which does NOT forward an `AbortSignal` — so we can't actually cancel an in-flight request. Instead, the hook uses a `cancelled` flag in the effect cleanup so stale results are discarded (the IPC call still completes on the server, just its result is ignored).

- [ ] **Step 1.1 — write the failing tests** in `src/renderer/src/hooks/__tests__/useSalesProducts.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildProductSearchUrl, fallbackFilter } from '../useSalesProducts'
import type { CachedProduct } from '@/lib/db'

const p = (over: Partial<CachedProduct>): CachedProduct => ({
  id: over.id ?? 'p',
  name: over.name ?? 'Product',
  sku: over.sku ?? 'SKU',
  barcode: over.barcode ?? null,
  price: over.price ?? 100,
  stock: over.stock ?? 10,
  isActive: over.isActive ?? true,
} as unknown as CachedProduct)

describe('buildProductSearchUrl', () => {
  it('uses topSellers=true when search is empty or whitespace', () => {
    expect(buildProductSearchUrl('')).toBe('/api/product/cart?topSellers=true')
    expect(buildProductSearchUrl('   ')).toBe('/api/product/cart?topSellers=true')
  })
  it('sends q with URL-encoded query when typed', () => {
    expect(buildProductSearchUrl('hello world')).toBe('/api/product/cart?q=hello%20world')
    expect(buildProductSearchUrl('a&b')).toBe('/api/product/cart?q=a%26b')
  })
})

describe('fallbackFilter', () => {
  const cache: CachedProduct[] = [
    p({ id: '1', name: 'Apple Juice', sku: 'AJ-1' }),
    p({ id: '2', name: 'Banana Bread', sku: 'BB-2', barcode: '1234567890' }),
    p({ id: '3', name: 'Inactive Item', sku: 'X', isActive: false }),
    p({ id: '4', name: 'Apple Pie', sku: 'AP-3' }),
  ]
  it('empty query → first 30 active items, in input order', () => {
    expect(fallbackFilter(cache, '').map(x => x.id)).toEqual(['1', '2', '3', '4'])
  })
  it('matches name (case-insensitive)', () => {
    expect(fallbackFilter(cache, 'apple').map(x => x.id).sort()).toEqual(['1', '4'])
  })
  it('matches sku', () => {
    expect(fallbackFilter(cache, 'BB').map(x => x.id)).toEqual(['2'])
  })
  it('matches barcode substring', () => {
    expect(fallbackFilter(cache, '12345').map(x => x.id)).toEqual(['2'])
  })
  it('typed query excludes inactive', () => {
    expect(fallbackFilter(cache, 'inactive')).toEqual([])
  })
  it('caps results at 30', () => {
    const many = Array.from({ length: 50 }, (_, i) => p({ id: String(i), name: `Item ${i}`, sku: `S${i}` }))
    expect(fallbackFilter(many, '').length).toBe(30)
  })
})
```

- [ ] **Step 1.2 — run, confirm fail** (file/exports missing):
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/hooks/__tests__/useSalesProducts.test.ts 2>&1 | tail -8
```

- [ ] **Step 1.3 — implement** `src/renderer/src/hooks/useSalesProducts.ts`:
```ts
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { db } from '@/lib/db'
import type { CachedProduct } from '@/lib/db'

const DEBOUNCE_MS = 250
const MAX_FALLBACK = 30

export function buildProductSearchUrl(search: string): string {
  const q = search.trim()
  if (!q) return '/api/product/cart?topSellers=true'
  return `/api/product/cart?q=${encodeURIComponent(q)}`
}

export function fallbackFilter(cache: CachedProduct[], search: string): CachedProduct[] {
  const q = search.trim().toLowerCase()
  if (!q) return cache.slice(0, MAX_FALLBACK)
  return cache
    .filter(p => p.isActive && (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    ))
    .slice(0, MAX_FALLBACK)
}

async function loadCachedFallback(search: string): Promise<CachedProduct[]> {
  const all = await db.products.toArray()
  return fallbackFilter(all, search)
}

export function useSalesProducts({ search }: { search: string }): { products: CachedProduct[]; loading: boolean } {
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiFetch(buildProductSearchUrl(search))
        if (cancelled) return
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
        if (cancelled) return
        setProducts(Array.isArray(data) ? (data as CachedProduct[]) : [])
      } catch {
        if (cancelled) return
        const cached = await loadCachedFallback(search)
        if (cancelled) return
        setProducts(cached)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  return { products, loading }
}
```

- [ ] **Step 1.4 — run, confirm pass**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/hooks/__tests__/useSalesProducts.test.ts 2>&1 | tail -6
```
Expected: all passing.

- [ ] **Step 1.5 — commit**:
```bash
git add src/renderer/src/hooks/useSalesProducts.ts src/renderer/src/hooks/__tests__/useSalesProducts.test.ts
git commit -m "feat(sales): useSalesProducts hook (topSellers default + debounced server search + offline fallback)"
```

---

## Task 2: make ProductGrid controlled + spinner

**File:** `src/renderer/src/components/ProductGrid.tsx`

Current state to change:
- Line ~29: `const [search, setSearch] = useState('')` — REMOVE; use the prop.
- Line ~49: `filtered` includes a per-keystroke `q = search.toLowerCase()` filter on name/sku/barcode — REMOVE that branch (server returns matches; the local set only ever needs the category filter).
- The search `<Input>` (find it via `<Input` with a `Search` icon near the top of the JSX) — change its `value`/`onChange` to use the props.
- Add a small loading indicator next to the `Search` icon when `loading`.

- [ ] **Step 2.1 — add the new props.** Extend the `Props` interface:
```ts
interface Props {
  products: CachedProduct[]
  customers: CachedCustomer[]
  customer: CachedCustomer | null
  cart: CartItem[]
  categoryNames: Record<string, string>
  searchRef?: RefObject<HTMLInputElement | null>
  search: string
  onSearchChange: (value: string) => void
  loading?: boolean
  onAddToCart: (product: CachedProduct) => void
  onSelectCustomer: (customer: CachedCustomer | null) => void
}
```
And the destructure on the function signature — add `search`, `onSearchChange`, `loading`.

- [ ] **Step 2.2 — drop the internal `search` state.** Remove the `const [search, setSearch] = useState('')` line. Replace any remaining internal call to `setSearch(...)` with `onSearchChange(...)`.

- [ ] **Step 2.3 — simplify `filtered`.** Replace the existing `filtered` `useMemo` with:
```ts
  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!p.isActive) return false
      if (categoryId && p.categoryId !== categoryId) return false
      return true
    })
  }, [products, categoryId])
```

- [ ] **Step 2.4 — wire the search input + spinner.** Find the `<Input>` with the `Search` icon. Update its `value`/`onChange` to use the props, and add a small `Loader2` spinner adjacent to the `Search` icon, visible only while `loading`. Replace:
```tsx
              <Search className='...' />
              <Input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                ...
              />
```
with (preserving any other classes/handlers on the `Input`):
```tsx
              <Search className='...' />
              {loading && <Loader2 className='absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground' aria-label='Loading products' />}
              <Input
                ref={searchRef}
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                ...
              />
```
Import `Loader2` from `lucide-react` alongside the existing `Search, Plus, PackageX`. If the `Search` icon's container isn't `relative` already, add `relative` to its parent so the absolute spinner positions correctly.

- [ ] **Step 2.5 — verify** (`SalesPage` will error until Task 3 supplies the new required props — that's expected):
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck:web 2>&1 | grep "ProductGrid" || echo "ProductGrid clean"
```
Expected: `ProductGrid clean`.

- [ ] **Step 2.6 — commit**:
```bash
git add src/renderer/src/components/ProductGrid.tsx
git commit -m "feat(grid): make ProductGrid controlled (search prop) + loading indicator"
```

---

## Task 3: wire SalesPage to the hook

**File:** `src/renderer/src/pages/SalesPage.tsx`

Current state to change:
- Lines ~16, 37: a local `products` state filled from `db.products.toArray()` and passed to `<ProductGrid products={products} ... />`. After this task, the grid's products come from the hook; the local state is removed.

- [ ] **Step 3.1 — imports**:
```ts
import { useSalesProducts } from '@/hooks/useSalesProducts'
```

- [ ] **Step 3.2 — remove the local `products` state and its loader effect**:
  - Remove the line `const [products, setProducts] = useState<CachedProduct[]>([])`.
  - In the existing `useEffect(() => { ... }, [])`, remove the line `db.products.toArray().then(setProducts)`.
  - If after removal `CachedProduct` is no longer used in this file, also remove it from the `import type { CachedProduct, CachedCustomer } from '@/lib/db'` line (keep `CachedCustomer`).
  - The `addToCart` callback already receives the product object via its argument from `ProductGrid` — it does not look at the local `products` array. No change needed there.

- [ ] **Step 3.3 — add the search state + the hook**, near the other `useState` hooks:
```ts
  const [search, setSearch] = useState('')
  const { products, loading } = useSalesProducts({ search })
```

- [ ] **Step 3.4 — pass the new props to `<ProductGrid />`**:
```tsx
        <ProductGrid
          products={products}
          customers={customers}
          customer={customer}
          cart={cart}
          categoryNames={categoryNames}
          searchRef={searchRef}
          search={search}
          onSearchChange={setSearch}
          loading={loading}
          onAddToCart={addToCart}
          onSelectCustomer={setCustomer}
        />
```
Keep every existing prop exactly as it was — only add `search`, `onSearchChange`, `loading`.

- [ ] **Step 3.5 — verify**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
```
Expected: `clean (only pre-existing)`.

- [ ] **Step 3.6 — commit**:
```bash
git add src/renderer/src/pages/SalesPage.tsx
git commit -m "feat(sales): drive ProductGrid with useSalesProducts (search-first + top sellers)"
```

---

## Task 4: full verification

- [ ] **Step 4.1 — typecheck + unit tests**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
npx vitest run src/renderer/src/hooks/__tests__/useSalesProducts.test.ts src/renderer/src/lib/__tests__/cart.test.ts src/renderer/src/lib/__tests__/discount.test.ts 2>&1 | tail -6
```
Expected: clean; all tests pass.

- [ ] **Step 4.2 — manual smoke** (`npm run dev`):
  - On Sales open: the grid shows **top sellers** (≤30 cards) instead of every cached product. Brief spinner near the search input on first load.
  - Type `apple` → a short debounce → results replace the grid; clear the input → top sellers return.
  - Type a real SKU/brand/barcode substring → server returns matches.
  - Disconnect the network → type a query → after the failed request, the cached fallback (≤30 cards filtered locally) appears. Reconnect, type again → server results return.
  - Click a category pill (if any) → it client-side narrows whatever the grid is currently showing.
  - Arrow-key navigate the visible results + Enter → adds the highlighted product to the cart.

- [ ] **Step 4.3 — final commit (if pending)**:
```bash
git add -A && git commit -m "feat: desktop search-first product grid (top sellers + server search + offline fallback)" || echo "nothing to commit"
```
