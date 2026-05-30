# Desktop Sales Screen — Resolution-Adaptive Layout — Design Spec

**Date:** 2026-05-30
**Project:** Zolvix Desktop (`zolvix-desktop`)

## Problem

The desktop sales screen is locked to a fixed layout that doesn't adapt to monitor size:

- `SalesPage.tsx:139,154` splits the screen into a hard `flex-[3]` : `flex-1` ratio (products 75 %, cart 25 %). On a 13" MacBook Air this squeezes the products; on a 4K display the cart panel grows to a comically wide column while the product grid keeps the same number of cards just bigger.
- `ProductGrid.tsx:171` has `grid grid-cols-4` baked in, so the grid never gets more than 4 columns regardless of width. The constant `GRID_COLS = 4` is also used by the arrow-key navigation (`ProductGrid.tsx:100-101`), so any responsive column change must keep keyboard nav in sync.

## Scope

In scope (v1):
- Stop the cart sidebar from growing past a sensible cap.
- Let the product grid auto-fill as many columns as fit the available width.
- Keep arrow-key navigation correct as the column count changes.

Out of scope:
- Re-theming/restyling product cards.
- Touch-target tuning for tablet mode.
- Re-layouting the customer-facing header or the discount panel.

## Key decisions

- **Cart sidebar = fixed cap.** Cart panel becomes `basis-[400px] shrink-0 max-w-[420px]` with a `min-w-[320px]` floor. Products take everything else with `flex-1 min-w-0`. Net effect: cart is always 320–420 px; products soak up the remaining width.
- **Product grid = auto-fill, no fixed column count.** Replace `grid-cols-4` with the arbitrary value `grid-cols-[repeat(auto-fill,minmax(200px,1fr))]`. Columns are derived purely from the panel width; no media queries needed.
- **Arrow nav reads the *actual* rendered column count.** A small `useEffect` + `ResizeObserver` on the grid container reads `getComputedStyle(grid).gridTemplateColumns`, counts the tokens (one token per column), stores the result in state, and the `ArrowUp`/`ArrowDown` math uses that value instead of the constant. Initial render uses `4` as a safe default until the first measurement.

## Approximate column counts at common widths

(Cart capped at ~400 px; remainder is the product panel width.)

| Viewport | Product panel | Approx cols (≥200 px each) |
|---|---|---|
| 1366 (MBA 13") | ~966 px  | 4 |
| 1440 (MBA 15") | ~1040 px | 5 |
| 1920 (FHD)     | ~1500 px | 7 |
| 2560 (QHD)     | ~2140 px | 10 |
| 3840 (4K)      | ~3420 px | 17 |

The 200 px minimum keeps cards readable; tune later if cards feel too small on wide displays.

## Components

| File | Action |
|------|--------|
| `src/renderer/src/pages/SalesPage.tsx` | swap the `flex-[3]`/`flex-1` pair for `flex-1 min-w-0` (products) and `basis-[400px] shrink-0 min-w-[320px] max-w-[420px]` (cart). |
| `src/renderer/src/components/ProductGrid.tsx` | replace `grid-cols-4` with `grid-cols-[repeat(auto-fill,minmax(200px,1fr))]`; replace the `GRID_COLS = 4` constant with a `colsRef` + `gridCols` state; add a `useEffect` that attaches a `ResizeObserver` to `gridRef.current` and updates `gridCols` from `getComputedStyle(grid).gridTemplateColumns.split(' ').length`; switch the arrow-up/down math to use `gridCols`. |

No new files, no schema changes, no API changes.

## Architecture

Data flow for keyboard nav (the only non-trivial wiring):

```
mount / window resize / cart change
        │
        ▼
ResizeObserver on gridRef.current  ─► getComputedStyle(grid).gridTemplateColumns
        │                                   │
        │                                   ▼
        │                            count = tokens.split(' ').length
        ▼
setGridCols(count)
        │
        ▼
ArrowUp / ArrowDown → setHighlight(i => clamp(i ± gridCols))
```

The grid container drives the layout (CSS); the observer feeds the keyboard model the same value the browser used. No two sources of truth.

## Error handling & edge cases

- Before the first measurement (initial render), `gridCols` is `4`. Arrow nav still works; the value gets corrected within one frame once the observer fires.
- Empty grid (no children): `gridTemplateColumns` returns `"none"` → falls back to `4`.
- Window resize past a breakpoint where `auto-fill` adds/removes a column: the observer fires, `gridCols` updates, arrow nav switches seamlessly.
- Below 320 px wide (extremely small window) the cart hits its `min-w-[320px]` and the products may overflow horizontally — acceptable, this is not a real POS resolution.

## Testing

- **Unit (pure helper):** extract the column-count parse as a pure function `gridColsFromComputedStyle(value: string): number` and unit-test it (`"180px 180px 180px"` → 3, `"repeat(2, 1fr)"` won't actually appear because `getComputedStyle` resolves to explicit tracks, `"none"` → fallback 4, `""` → 4).
- **Manual smoke:** open the desktop in dev, resize the window through 1366 / 1600 / 1920 / 2560 px; confirm the cart caps at ~400 px and the product columns recalc; tab to the search box, arrow-down navigates by the *visible* column count, not by 4.
