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
