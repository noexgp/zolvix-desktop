# Desktop Responsive Sales Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Zolvix Desktop sales screen layout adapt to any monitor resolution — cart sidebar gets a fixed-width cap, the product grid auto-fills as many ~200 px columns as fit, and arrow-key navigation reads the actual rendered column count.

**Architecture:** Replace the hard `flex-[3] : flex-1` split in `SalesPage` with a flex-1 product panel + a `basis-[400px] shrink-0 min-w-[320px] max-w-[420px]` cart panel. Swap the product grid container's fixed `grid-cols-4` for `grid-cols-[repeat(auto-fill,minmax(200px,1fr))]`. Replace the `GRID_COLS = 4` constant with a `gridCols` state synced by a `ResizeObserver` on the grid container reading `getComputedStyle(grid).gridTemplateColumns`; the parse is a pure helper unit-tested in isolation.

**Tech Stack:** Electron + React + TS (renderer), Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-desktop-responsive-sales-screen-design.md`

---

## File Map

| File | Action |
|------|--------|
| `src/renderer/src/lib/grid-cols.ts` | new — `gridColsFromComputedStyle(value: string): number` pure helper |
| `src/renderer/src/lib/__tests__/grid-cols.test.ts` | new — tests for the parse |
| `src/renderer/src/components/ProductGrid.tsx` | drop `GRID_COLS = 4` constant; add `gridCols` state + `ResizeObserver` effect; use `gridCols` in arrow nav; change grid container's `grid-cols-4` → `grid-cols-[repeat(auto-fill,minmax(200px,1fr))]` |
| `src/renderer/src/pages/SalesPage.tsx` | swap `flex-[3]` / `flex-1` for `flex-1 min-w-0` (products) + `basis-[400px] shrink-0 min-w-[320px] max-w-[420px]` (cart) |

---

## Task 1: `gridColsFromComputedStyle` pure helper (TDD)

**Files:** `src/renderer/src/lib/grid-cols.ts` (new), `src/renderer/src/lib/__tests__/grid-cols.test.ts` (new)

`getComputedStyle(grid).gridTemplateColumns` returns the *explicit* track sizes the browser used (e.g. `"180.5px 180.5px 180.5px"`) or `"none"` when the element has no resolved tracks. The helper turns that string into a count, with a safe fallback of `4` when the value isn't parseable yet.

- [ ] **Step 1.1 — write the failing tests** in `src/renderer/src/lib/__tests__/grid-cols.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { gridColsFromComputedStyle } from '../grid-cols'

describe('gridColsFromComputedStyle', () => {
  it('counts space-separated track sizes', () => {
    expect(gridColsFromComputedStyle('180px 180px 180px')).toBe(3)
    expect(gridColsFromComputedStyle('120.5px 120.5px 120.5px 120.5px 120.5px')).toBe(5)
  })
  it('counts a single column', () => {
    expect(gridColsFromComputedStyle('200px')).toBe(1)
  })
  it('falls back to 4 for empty input', () => {
    expect(gridColsFromComputedStyle('')).toBe(4)
  })
  it('falls back to 4 for "none"', () => {
    expect(gridColsFromComputedStyle('none')).toBe(4)
  })
  it('tolerates extra whitespace', () => {
    expect(gridColsFromComputedStyle('  180px   180px  ')).toBe(2)
  })
})
```

- [ ] **Step 1.2 — confirm fail** (file/export missing):
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/lib/__tests__/grid-cols.test.ts 2>&1 | tail -8
```

- [ ] **Step 1.3 — implement** `src/renderer/src/lib/grid-cols.ts`:
```ts
/**
 * Counts the number of columns in a CSS `grid-template-columns` value
 * (as returned by `getComputedStyle(el).gridTemplateColumns`). Falls back
 * to 4 when the value is empty or `none` — used as the initial value
 * before the ResizeObserver has measured.
 */
export function gridColsFromComputedStyle(value: string): number {
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'none') return 4
  return trimmed.split(/\s+/).length
}
```

- [ ] **Step 1.4 — confirm pass**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npx vitest run src/renderer/src/lib/__tests__/grid-cols.test.ts 2>&1 | tail -6
```
Expected: all passing (5 tests).

- [ ] **Step 1.5 — commit**:
```bash
git add src/renderer/src/lib/grid-cols.ts src/renderer/src/lib/__tests__/grid-cols.test.ts
git commit -m "feat(grid): gridColsFromComputedStyle helper"
```

---

## Task 2: ProductGrid — auto-fill columns + dynamic arrow nav

**File:** `src/renderer/src/components/ProductGrid.tsx`

Current state to change:
- Line ~30: `const GRID_COLS = 4` — remove.
- Lines ~100-101: arrow up/down use `GRID_COLS` — switch to `gridCols` state.
- Line ~171: grid container is `flex-1 overflow-y-auto p-3 grid grid-cols-4 gap-2.5 content-start` — swap `grid-cols-4` for the auto-fill arbitrary value.
- A new `useEffect` attaches a `ResizeObserver` to `gridRef.current` and keeps `gridCols` in sync.

- [ ] **Step 2.1 — add the helper import** (top of file, near other `@/...` imports):
```ts
import { gridColsFromComputedStyle } from '@/lib/grid-cols'
```

- [ ] **Step 2.2 — remove the constant**. Delete this line:
```ts
const GRID_COLS = 4
```

- [ ] **Step 2.3 — add the state + observer effect**. Add the `useState` near the other top-level state inside the component (alongside `const gridRef = useRef<HTMLDivElement>(null)`):
```ts
  const [gridCols, setGridCols] = useState(4)
```
Then add this new `useEffect` somewhere among the existing effects (e.g. right after the existing scroll-into-view effect that already depends on `gridRef`):
```ts
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const update = () => setGridCols(gridColsFromComputedStyle(getComputedStyle(el).gridTemplateColumns))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
```
(`useState` and `useEffect` are already imported at the top of the file from `'react'` — no import change needed.)

- [ ] **Step 2.4 — switch the arrow up/down to `gridCols`**. Find the existing `ArrowDown` / `ArrowUp` branches in `onSearchKeyDown` and replace them. The block currently reads (with surrounding context for an unambiguous match):
```ts
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => Math.min(last, i + GRID_COLS)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => Math.max(0, i - GRID_COLS)) }
```
Change it to:
```ts
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => Math.min(last, i + gridCols)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => Math.max(0, i - gridCols)) }
```
(Only the constant identifier changes — keep the rest of the function as-is.)

- [ ] **Step 2.5 — swap the grid container className**. Find this line in the JSX:
```tsx
      <div ref={gridRef} className="flex-1 overflow-y-auto p-3 grid grid-cols-4 gap-2.5 content-start">
```
Replace it with:
```tsx
      <div ref={gridRef} className="flex-1 overflow-y-auto p-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 content-start">
```

- [ ] **Step 2.6 — verify**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
```
Expected: `clean (only pre-existing)`.

- [ ] **Step 2.7 — commit**:
```bash
git add src/renderer/src/components/ProductGrid.tsx
git commit -m "feat(grid): auto-fill columns + dynamic arrow-nav column count"
```

---

## Task 3: SalesPage — cap cart sidebar, let products fill

**File:** `src/renderer/src/pages/SalesPage.tsx`

Current state to change:
- Line ~139: `<div className="flex-[3] min-w-0 flex flex-col">` — the product panel; widen.
- Line ~154: `<div className="flex-1 min-w-0 flex flex-col border-l border-border">` — the cart panel; cap.

- [ ] **Step 3.1 — widen the product panel**. Replace the line:
```tsx
      <div className="flex-[3] min-w-0 flex flex-col">
```
with:
```tsx
      <div className="flex-1 min-w-0 flex flex-col">
```

- [ ] **Step 3.2 — cap the cart panel**. Replace the line:
```tsx
      <div className="flex-1 min-w-0 flex flex-col border-l border-border">
```
with:
```tsx
      <div className="basis-[400px] shrink-0 min-w-[320px] max-w-[420px] flex flex-col border-l border-border">
```

- [ ] **Step 3.3 — verify**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
```
Expected: `clean (only pre-existing)`.

- [ ] **Step 3.4 — commit**:
```bash
git add src/renderer/src/pages/SalesPage.tsx
git commit -m "feat(sales): cap cart sidebar, products take remaining width"
```

---

## Task 4: full verification

- [ ] **Step 4.1 — typecheck + tests**:
```bash
cd /Users/glenn/dev/zolvix-desktop
npm run typecheck 2>&1 | grep "error TS" | grep -vE "Versions.tsx|EditSOPage.tsx|NewSOPage.tsx" || echo "clean (only pre-existing)"
npx vitest run src/renderer/src/lib/__tests__/grid-cols.test.ts src/renderer/src/hooks/__tests__/useSalesProducts.test.ts src/renderer/src/lib/__tests__/cart.test.ts src/renderer/src/lib/__tests__/discount.test.ts 2>&1 | tail -6
```
Expected: typecheck clean; all tests pass.

- [ ] **Step 4.2 — manual smoke** (`npm run dev`):
  - Open Sales. Resize the window through ~1366, ~1600, ~1920, ~2560 px wide:
    - Cart panel stays between 320 px (very narrow) and ~420 px (wide).
    - Product grid columns recalc — visible columns grow with width, cards stay ~200 px+ wide.
  - Focus the search input; arrow-down on a wide window moves down by the *visible* column count (e.g. 7 on FHD), not 4.
  - At ultra-wide (4K) the cart is still capped; products fill the rest with many columns.
  - Empty cart, top-sellers state, search-typed state, and keyboard nav all still behave correctly.

- [ ] **Step 4.3 — final commit (if pending)**:
```bash
git add -A && git commit -m "feat: desktop responsive sales screen (cart cap + auto-fill grid)" || echo "nothing to commit"
```
