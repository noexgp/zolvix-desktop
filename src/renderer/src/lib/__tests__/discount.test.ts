import { describe, it, expect } from 'vitest'
import { computeSale } from '../discount'
import type { DiscountItem } from '../discount'

const vatable = (lineTotal: number, scDiscountExempt = false): DiscountItem => ({ lineTotal, vatType: 'VATABLE', scDiscountExempt })
const exempt  = (lineTotal: number): DiscountItem => ({ lineTotal, vatType: 'EXEMPT', scDiscountExempt: false })
const zero    = (lineTotal: number): DiscountItem => ({ lineTotal, vatType: 'ZERO_RATED', scDiscountExempt: false })

describe('computeSale — no holder', () => {
  it('splits a VATABLE cart into net sales + VAT', () => {
    const r = computeSale([vatable(112)], null)
    expect(r.vat.vatableSales).toBeCloseTo(100, 2)
    expect(r.vat.vatAmount).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(112, 2)
    expect(r.discount).toBe(0)
  })
  it('classifies EXEMPT and ZERO_RATED separately', () => {
    const r = computeSale([vatable(112), exempt(50), zero(30)], null)
    expect(r.vat.vatableSales).toBeCloseTo(100, 2)
    expect(r.vat.vatAmount).toBeCloseTo(12, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(50, 2)
    expect(r.vat.zeroRatedSales).toBeCloseTo(30, 2)
    expect(r.amountDue).toBeCloseTo(192, 2)
  })
})

describe('computeSale — SC/PWD', () => {
  it('removes VAT and gives 20% off the net base', () => {
    const r = computeSale([vatable(112)], 'SC')
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.amountDue).toBeCloseTo(80, 2)
    expect(r.vat.vatableSales).toBeCloseTo(0, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(100, 2)
  })
  it('excludes scDiscountExempt items from the eligible base', () => {
    const r = computeSale([vatable(112), vatable(50, true)], 'PWD')
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(130, 2)
  })
  it('gives 20% off an EXEMPT item at face value with no VAT step-down', () => {
    const r = computeSale([exempt(112)], 'SC')
    expect(r.discount).toBeCloseTo(22.4, 2)
    expect(r.vatExemptReduction).toBeCloseTo(0, 2)
    expect(r.amountDue).toBeCloseTo(89.6, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(112, 2)
  })
  it('mixed VATABLE + EXEMPT: 20% on (VATABLE net + EXEMPT face), VAT removed from VATABLE only', () => {
    const r = computeSale([vatable(112), exempt(50)], 'SC')
    // 20% × (100 net + 50 exempt face) = 30; VAT 12 removed from the VATABLE line only
    expect(r.discount).toBeCloseTo(30, 2)
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(120, 2)
    expect(r.vat.vatableSales).toBeCloseTo(0, 2)
    expect(r.vat.vatAmount).toBeCloseTo(0, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(150, 2)
  })
})

describe('computeSale — Solo Parent', () => {
  it('gives 10% off gross with no VAT exemption', () => {
    const r = computeSale([vatable(200)], 'SOLO_PARENT')
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.vatExemptReduction).toBe(0)
    expect(r.amountDue).toBeCloseTo(180, 2)
    expect(r.vat.vatableSales).toBeCloseTo(178.57, 2)
  })
})
