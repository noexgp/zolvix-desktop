# Desktop Customer Search-First Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cached 500-customer client-side filter in the desktop sales screen with a debounced server search over the full customer DB via the existing `GET /api/customer?search=<q>&limit=30`, while keeping Walk-in as the static default.

**Architecture:** A small `useCustomerSearch({ search })` hook (sibling to `useSalesProducts`) owns the debounced fetch + offline fallback. `SearchableSelect` gets an optional `onSearchChange` prop — when supplied, the component drops its internal `includes()` filter and renders `items` as-is, letting the parent drive results. `ProductGrid` lifts a small `customerSearch` state, calls the hook, and assembles `items={[{ id: '', label: 'Walk-in' }, ...searchedCustomers]}` for the picker.

**Tech Stack:** Electron + React + TS (renderer), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-desktop-customer-search-first-design.md`

---

## File Map

| File | Action |
|------|--------|
| `src/renderer/src/hooks/useCustomerSearch.ts` | new — `buildCustomerSearchUrl(q)` + `useCustomerSearch({ search })` |
| `src/renderer/src/hooks/__tests__/useCustomerSearch.test.ts` | new — pure-helper tests |
| `src/renderer/src/components/SearchableSelect.tsx` | add optional `onSearchChange?: (q: string) => void`; when provided, call it on every query change/reset and skip the internal filter |
| `src/renderer/src/components/ProductGrid.tsx` | drop the cached-customers memo; add `customerSearch` state + `useCustomerSearch` call; assemble `items` and pass `onSearchChange={setCustomerSearch}` to `<SearchableSelect>` |

---

## Task 1: `useCustomerSearch` + pure-helper tests (TDD)

**Files:** `src/renderer/src/hooks/useCustomerSearch.ts` (new), `src/renderer/src/hooks/__tests__/useCustomerSearch.test.ts` (new)

The `buildCustomerSearchUrl` helper returns `null` when the search is empty or whitespace-only (the hook then short-circuits with no fetch) and a fully-encoded URL otherwise. The async `useCustomerSearch` hook follows the same shape as `useSalesProducts`: debounce 250 ms, cancel-flag pattern (the IPC bridge doesn't honor `AbortSignal`), and an offline fallback that filters `db.customers` by `name|email|phone` `.includes(q)` capped at 30.

- [ ] **Step 1.1 — write the failing test file** `src/renderer/src/hooks/__tests__/useCustomerSearch.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildCustomerSearchUrl } from '../useCustomerSearch'

describe('buildCustomerSearchUrl', () => {
  it('returns null for empty or whitespace input', () => {
    expect(buildCustomerSearchUrl('')).toBe(null)
    expect(buildCustomerSearchUrl('   ')).toBe(null)
  })
  it('builds a URL with encoded query and limit=30 for typed input', () => {
    expect(buildCustomerSearchUrl('Maria')).toBe('/api/customer?search=Maria&limit=30')
    expect(buildCustomerSearchUrl('hello world')).toBe('/api/customer?search=hello%20world&limit=30')
    expect(buildCustomerSearchUrl('a&b')).toBe('/api/customer?search=a%26b&limit=30')
  })
  it('trims whitespace before building', () => {
    expect(buildCustomerSearchUrl('  Maria  ')).toBe('/api/customer?search=Maria&limit=30')
  })
})
```

- [ ] **Step 1.2 — confirm fail**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/hooks/__tests__/useCustomerSearch.test.ts 2>&1 | tail -8
```
Expected: FAIL (file/export missing).

- [ ] **Step 1.3 — implement** `src/renderer/src/hooks/useCustomerSearch.ts`:
```ts
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { db } from '@/lib/db'
import type { CachedCustomer } from '@/lib/db'

const DEBOUNCE_MS = 250
const MAX_FALLBACK = 30

export function buildCustomerSearchUrl(search: string): string | null {
  const q = search.trim()
  if (!q) return null
  return `/api/customer?search=${encodeURIComponent(q)}&limit=${MAX_FALLBACK}`
}

async function loadCachedFallback(search: string): Promise<CachedCustomer[]> {
  const all = await db.customers.toArray()
  const q = search.trim().toLowerCase()
  return all
    .filter(c => c.isActive && (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    ))
    .slice(0, MAX_FALLBACK)
}

export function useCustomerSearch({ search }: { search: string }): { customers: CachedCustomer[]; loading: boolean } {
  const [customers, setCustomers] = useState<CachedCustomer[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const url = buildCustomerSearchUrl(search)
    if (!url) {
      // empty search → no fetch, no results (Walk-in is the only visible row)
      setCustomers([])
      setLoading(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiFetch(url)
        if (cancelled) return
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
        if (cancelled) return
        const list: CachedCustomer[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.customers) ? data.customers : []
        setCustomers(list)
      } catch {
        if (cancelled) return
        const cached = await loadCachedFallback(search)
        if (cancelled) return
        setCustomers(cached)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  return { customers, loading }
}
```

- [ ] **Step 1.4 — confirm pass**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/hooks/__tests__/useCustomerSearch.test.ts 2>&1 | tail -6
```
Expected: all passing (4 tests).

- [ ] **Step 1.5 — commit**:
```bash
git add src/renderer/src/hooks/useCustomerSearch.ts src/renderer/src/hooks/__tests__/useCustomerSearch.test.ts
git commit -m "feat(customers): useCustomerSearch hook (server search + offline fallback)"
```

---

## Task 2: `SearchableSelect` — opt-in external search

**File:** `src/renderer/src/components/SearchableSelect.tsx`

The component currently owns `query` state and filters `items` via `.includes()`. We add an optional `onSearchChange?: (q: string) => void` prop. When provided: every internal `setQuery(...)` also calls `onSearchChange(...)`, and the `filtered` value bypasses the local filter and returns `items` directly. Backward-compatible: existing call sites that don't pass the prop see no behavior change.

- [ ] **Step 2.1 — extend the `Props` interface**. Replace the existing `Props`:
```ts
interface Props {
  id?: string
  value: string
  onChange: (id: string, label: string) => void
  items: { id: string; label: string }[]
  placeholder: string
  disabled?: boolean
  className?: string
  /** When provided, the parent owns filtering: this component stops its internal `.includes()` filter and just renders `items` as-is. Also called whenever the user clears/types in the picker. */
  onSearchChange?: (q: string) => void
}
```

- [ ] **Step 2.2 — destructure the new prop** in the component signature:
```ts
export default function SearchableSelect({ id, value, onChange, items, placeholder, disabled, className, onSearchChange }: Props) {
```

- [ ] **Step 2.3 — bypass the local filter when controlled**. Replace the existing `filtered` computation:
```ts
  const filtered = query
    ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : items
```
with:
```ts
  const filtered = onSearchChange
    ? items
    : query ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase())) : items
```

- [ ] **Step 2.4 — propagate query changes to the parent**. Find each `setQuery(...)` call (there are five, in `onClickOutside`, `selectItem`, `Escape`, `onFocus`, and the input's `onChange`). Add an `onSearchChange?.(<same value>)` next to each. Specifically:

  In the document `mousedown` handler (currently `setOpen(false); setQuery(''); setHighlightIndex(-1)`):
```ts
        setOpen(false); setQuery(''); setHighlightIndex(-1); onSearchChange?.('')
```

  In `selectItem` (currently `setQuery(''); setOpen(false); setHighlightIndex(-1)`):
```ts
    setQuery(''); setOpen(false); setHighlightIndex(-1); onSearchChange?.('')
```

  In the `Escape` branch (currently `setOpen(false); setQuery(''); setHighlightIndex(-1)`):
```ts
      setOpen(false); setQuery(''); setHighlightIndex(-1); onSearchChange?.('')
```

  In the input's `onFocus` (currently `() => { setOpen(true); setQuery(''); setHighlightIndex(-1) }`):
```ts
        onFocus={() => { setOpen(true); setQuery(''); setHighlightIndex(-1); onSearchChange?.('') }}
```

  In the input's `onChange` (currently `e => { setQuery(e.target.value); setOpen(true); setHighlightIndex(0) }`):
```ts
        onChange={e => { setQuery(e.target.value); setOpen(true); setHighlightIndex(0); onSearchChange?.(e.target.value) }}
```

- [ ] **Step 2.5 — verify** (existing call sites must still compile because the prop is optional):
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "SearchableSelect" || echo "SearchableSelect clean"
```
Expected: `SearchableSelect clean`.

- [ ] **Step 2.6 — commit**:
```bash
git add src/renderer/src/components/SearchableSelect.tsx
git commit -m "feat(select): optional onSearchChange — parent owns filtering when provided"
```

---

## Task 3: ProductGrid — drive the customer picker from the hook

**File:** `src/renderer/src/components/ProductGrid.tsx`

The current customer picker is fed by `const customerItems = useMemo(() => customers.map(c => ({ id: c.id, label: c.name })), [customers])` (cached 500). We replace that with a `customerSearch` state + the new hook, and wire `onSearchChange` into the `<SearchableSelect>`. The `customers` prop coming in from `SalesPage` keeps streaming into the file but is no longer used by the picker (it's the offline-cache backing store the hook reads from when needed — we don't remove the prop).

- [ ] **Step 3.1 — add the hook import** alongside the existing `@/hooks/...` imports:
```ts
import { useCustomerSearch } from '@/hooks/useCustomerSearch'
```

- [ ] **Step 3.2 — add the search state + hook call**. Inside the component (e.g. right after the existing `const [searchFocused, setSearchFocused] = useState(false)`), add:
```ts
  const [customerSearch, setCustomerSearch] = useState('')
  const { customers: searchedCustomers } = useCustomerSearch({ search: customerSearch })
```

- [ ] **Step 3.3 — replace the cached items memo**. The file currently has:
```ts
  const customerItems = useMemo(() =>
    customers.map(c => ({ id: c.id, label: c.name })), [customers])
```
Replace with:
```ts
  const customerItems = useMemo(() =>
    searchedCustomers.map(c => ({ id: c.id, label: c.name })), [searchedCustomers])
```
(Imports of `useMemo` already exist; no import change.)

- [ ] **Step 3.4 — pass `onSearchChange` to the picker**. Find the `<SearchableSelect>` for the customer:
```tsx
          <SearchableSelect
            value={customer?.id ?? ''}
            onChange={id => {
              if (!id) { onSelectCustomer(null); return }
              onSelectCustomer(customers.find(c => c.id === id) ?? null)
            }}
            items={[{ id: '', label: 'Walk-in' }, ...customerItems]}
```
The `items` line stays the same (Walk-in plus the derived items). The `onChange` body still searches the cached `customers` prop for the picked id — that mostly works for online-recent hits (the server response shape matches what we've already put in cache), but to be safe against a freshly-found customer that isn't in `db.customers` yet, change the `onChange` to also fall back to `searchedCustomers`:
```tsx
          <SearchableSelect
            value={customer?.id ?? ''}
            onChange={id => {
              if (!id) { onSelectCustomer(null); return }
              onSelectCustomer(
                customers.find(c => c.id === id)
                ?? (searchedCustomers.find(c => c.id === id) ?? null)
              )
            }}
            items={[{ id: '', label: 'Walk-in' }, ...customerItems]}
            onSearchChange={setCustomerSearch}
```
(Keep every other prop on the `<SearchableSelect>` exactly as it currently is — only the `onChange` body is rewritten and `onSearchChange` is added.)

- [ ] **Step 3.5 — verify**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
```
Expected: `clean (only pre-existing)`.

- [ ] **Step 3.6 — commit**:
```bash
git add src/renderer/src/components/ProductGrid.tsx
git commit -m "feat(customers): drive picker with server search via useCustomerSearch"
```

---

## Task 4: full verification

- [ ] **Step 4.1 — typecheck + tests**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
npx vitest run src/renderer/src/hooks/__tests__/useCustomerSearch.test.ts src/renderer/src/hooks/__tests__/useSalesProducts.test.ts src/renderer/src/lib/__tests__/grid-cols.test.ts src/renderer/src/lib/__tests__/cart.test.ts src/renderer/src/lib/__tests__/discount.test.ts 2>&1 | tail -6
```
Expected: typecheck clean; all tests pass.

- [ ] **Step 4.2 — manual smoke** (`npm run dev`):
  - Open Sales. The customer picker shows **Walk-in** (and nothing else) until you type.
  - Type a name fragment → after ~250 ms the dropdown lists matches from the **whole** customer DB (verify by searching for a customer beyond the first 500 of the cache).
  - Type an email/phone fragment → matches there too.
  - Clear the input → list reverts to just Walk-in.
  - Disconnect the network → typing falls back to filtered cached customers.
  - Pick a customer → it sets correctly; pick Walk-in → resets to null.
  - All other call sites of `SearchableSelect` (e.g. category pickers, if any) still behave as before.

- [ ] **Step 4.3 — final commit (if pending)**:
```bash
git add -A && git commit -m "feat: desktop customer search-first picker" || echo "nothing to commit"
```
