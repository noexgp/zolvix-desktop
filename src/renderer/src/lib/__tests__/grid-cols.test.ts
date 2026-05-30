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
