# Desktop Barcode/SKU Scan-to-Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a barcode scanner (or a manually-typed SKU) blasts a single-token value into the search box on the desktop sales screen and presses Enter, perform an immediate exact-match lookup that bypasses the 250 ms debounced search, add the product to the cart, clear the input, and refocus — without changing the existing highlight-Enter behavior for typed names.

**Architecture:** Add two small helpers to the existing `useSalesProducts.ts` hook file: a pure `isLikelyCode(text)` predicate (single non-empty token, no whitespace) and an async `scanProduct(q)` that calls `/api/product/scan?q=…` and **strictly** accepts only `barcode === q` or `sku === q` matches (blocking the server's name-contains fallback). On strict reject or network error, fall back to `db.products` for an exact `barcode === q` / `sku === q` lookup. In `ProductGrid.tsx`, move the Enter handling above the existing `filtered.length === 0` early return so Enter can fire the scan path even when the current grid is empty or stale. On a strict miss everywhere, the existing `filtered[highlight]` behavior runs (unchanged).

**Tech Stack:** Electron + React + TS (renderer), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-desktop-barcode-scan-add-design.md`

---

## File Map

| File | Action |
|------|--------|
| `src/renderer/src/hooks/useSalesProducts.ts` | add exported `isLikelyCode` and `scanProduct` |
| `src/renderer/src/hooks/__tests__/useSalesProducts.test.ts` | append `isLikelyCode` tests |
| `src/renderer/src/components/ProductGrid.tsx` | rework `onSearchKeyDown` so Enter runs scan path first, then falls through to highlighted-Enter |

No server change, no settings, no new component.

---

## Task 1: `isLikelyCode` + `scanProduct` (TDD on the pure helper)

**Files:** `src/renderer/src/hooks/useSalesProducts.ts`, `src/renderer/src/hooks/__tests__/useSalesProducts.test.ts`

The async `scanProduct` lives in the same file because it shares the `flatten` helper and the `RawProduct` type that the hook already defines. Only the pure `isLikelyCode` is unit-tested (the async path is covered by manual smoke per the spec).

- [ ] **Step 1.1: Append failing tests** to `src/renderer/src/hooks/__tests__/useSalesProducts.test.ts` (the file already exists; add this whole block after the existing `describe(...)` blocks):
```ts
import { isLikelyCode } from '../useSalesProducts'

describe('isLikelyCode', () => {
  it('returns false for empty or all-whitespace input', () => {
    expect(isLikelyCode('')).toBe(false)
    expect(isLikelyCode('   ')).toBe(false)
  })
  it('returns true for a single token', () => {
    expect(isLikelyCode('a')).toBe(true)
    expect(isLikelyCode('apple')).toBe(true)
    expect(isLikelyCode('1234567890')).toBe(true)
    expect(isLikelyCode('SKU-001')).toBe(true)
  })
  it('returns true after trimming leading/trailing whitespace', () => {
    expect(isLikelyCode('  apple  ')).toBe(true)
  })
  it('returns false when there is an embedded space', () => {
    expect(isLikelyCode('apple pie')).toBe(false)
    expect(isLikelyCode('sku 001')).toBe(false)
  })
  it('returns false on whitespace-only characters (tab/newline)', () => {
    expect(isLikelyCode('\t\n')).toBe(false)
  })
})
```
(Add the new `import` line near the top of the file, NOT next to the existing imports if your linter prefers — keep this added import grouped with the existing `import { buildProductSearchUrl, fallbackFilter } from '../useSalesProducts'` line: simplest is to extend that existing import to `import { buildProductSearchUrl, fallbackFilter, isLikelyCode } from '../useSalesProducts'`.)

- [ ] **Step 1.2: Run, confirm fail** (export missing):
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/hooks/__tests__/useSalesProducts.test.ts 2>&1 | tail -8
```
Expected: FAIL on the new `isLikelyCode` tests.

- [ ] **Step 1.3: Add `isLikelyCode` and `scanProduct`** to `src/renderer/src/hooks/useSalesProducts.ts`. Append BOTH exports at the end of the file (after `useSalesProducts`). They reuse the file's existing `flatten` helper and `RawProduct` type:
```ts
export function isLikelyCode(text: string): boolean {
  const q = text.trim()
  return q.length > 0 && !/\s/.test(q)
}

export async function scanProduct(q: string): Promise<CachedProduct | null> {
  const text = q.trim()
  if (!text) return null
  try {
    const res = await apiFetch(`/api/product/scan?q=${encodeURIComponent(text)}`)
    if (res.ok) {
      const data = (await res.json()) as RawProduct | null
      // Strict accept: only treat as a real scan if barcode or SKU matches exactly.
      // Blocks the server's name-contains fallback from silently auto-adding.
      if (data && (data.barcode === text || data.sku === text)) {
        return flatten(data)
      }
    }
  } catch {
    // fall through to offline lookup
  }
  // Offline / strict-rejected fallback: exact match against the cached set.
  const all = await db.products.toArray()
  return all.find(p => p.isActive && (p.barcode === text || p.sku === text)) ?? null
}
```
If the file's `RawProduct` type or `flatten` function is currently `function`-declared (not `const`), they are already hoisted to module scope and `scanProduct` can use them as written. If they were declared as `const`, place these new exports BELOW their declarations.

- [ ] **Step 1.4: Run, confirm pass**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/hooks/__tests__/useSalesProducts.test.ts 2>&1 | tail -6
```
Expected: all passing (8 prior + 5 new = 13 tests).

- [ ] **Step 1.5: Commit**:
```bash
git add src/renderer/src/hooks/useSalesProducts.ts src/renderer/src/hooks/__tests__/useSalesProducts.test.ts
git commit -m "feat(scan): isLikelyCode + scanProduct helpers (server + offline, strict accept)"
```

---

## Task 2: ProductGrid Enter handler runs scan-then-add first

**File:** `src/renderer/src/components/ProductGrid.tsx`

The current `onSearchKeyDown` starts with `if (filtered.length === 0) return` — which blocks Enter from doing anything when the grid is empty or stale (the actual scanner-race symptom). Move the Enter branch ABOVE that early return, and make it async so it can `await scanProduct(...)`. Arrows keep the early return.

- [ ] **Step 2.1: Add the new imports.** The file already imports from `lucide-react`, etc. Add at the top, near the other `@/...` imports:
```ts
import { isLikelyCode, scanProduct } from '@/hooks/useSalesProducts'
```

- [ ] **Step 2.2: Replace the `onSearchKeyDown` function.** The current function reads (with surrounding context for an unambiguous match — search for `function onSearchKeyDown` in the file):
```ts
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return
    const last = filtered.length - 1
    if (e.key === 'ArrowRight') { e.preventDefault(); setHighlight(i => Math.min(last, i + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setHighlight(i => Math.max(0, i - 1)) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => Math.min(last, i + GRID_COLS)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => Math.max(0, i - GRID_COLS)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const p = filtered[highlight]
      if (p && p.stock !== 0) {
        onAddToCart(p)
        e.currentTarget.select()
      }
    }
  }
```
Replace it with:
```ts
  async function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter runs first so a barcode scan can race the debounced search.
    if (e.key === 'Enter') {
      e.preventDefault()
      const q = search.trim()
      if (!q) return
      if (isLikelyCode(q)) {
        const scanned = await scanProduct(q)
        if (scanned && scanned.stock !== 0) {
          onAddToCart(scanned)
          onSearchChange('')
          e.currentTarget.select()
          return
        }
      }
      // Fall through: existing highlighted-Enter behavior.
      const p = filtered[highlight]
      if (p && p.stock !== 0) {
        onAddToCart(p)
        e.currentTarget.select()
      }
      return
    }
    // Arrow navigation needs something visible.
    if (filtered.length === 0) return
    const last = filtered.length - 1
    if (e.key === 'ArrowRight') { e.preventDefault(); setHighlight(i => Math.min(last, i + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setHighlight(i => Math.max(0, i - 1)) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => Math.min(last, i + GRID_COLS)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => Math.max(0, i - GRID_COLS)) }
  }
```

- [ ] **Step 2.3: Verify**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
```
Expected: clean.

- [ ] **Step 2.4: Commit**:
```bash
git add src/renderer/src/components/ProductGrid.tsx
git commit -m "feat(grid): Enter scans first (bypasses debounce) before highlight-add"
```

---

## Task 3: Full verification

- [ ] **Step 3.1: Typecheck + tests**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
npx vitest run src/renderer/src/hooks/__tests__/useSalesProducts.test.ts src/renderer/src/lib/__tests__/cart.test.ts src/renderer/src/lib/__tests__/discount.test.ts 2>&1 | tail -6
```
Expected: typecheck clean; all tests pass.

- [ ] **Step 3.2: Manual smoke** (`npm run dev`):
  - Open Sales. Top sellers appear (search-first idle state, unchanged).
  - Scan or type a real barcode (single token) and press Enter → product is added immediately, search clears, input keeps focus, top sellers come back.
  - Type a real SKU (single token) + Enter → same.
  - Type a single token that is NOT a barcode/SKU but IS a substring of some product name (e.g. `shoe`) + Enter → does NOT auto-add the server's name-contains result (strict accept blocks it). Falls through to the highlighted card if any.
  - Disconnect the network → scan a cached barcode + Enter → still adds (offline `db.products` fallback).
  - Multi-word search like `red shirt` + Enter → existing highlight-Enter behavior (unchanged).
  - Empty input + Enter → does nothing (unchanged).
  - Arrow keys still navigate; the grid empty-state still shows when there are zero results.

- [ ] **Step 3.3: Final commit (if pending)**:
```bash
git add -A && git commit -m "feat: desktop barcode/SKU scan-to-add on Enter" || echo "nothing to commit"
```
