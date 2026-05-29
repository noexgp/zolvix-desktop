import { describe, it, expect } from 'vitest'
import { computeSale } from '../discount'
import type { DiscountItem, HolderType } from '../discount'

const vatable = (lineTotal: number, scDiscountExempt = false): DiscountItem => ({ lineTotal, vatType: 'VATABLE', scDiscountExempt })
const exempt  = (lineTotal: number): DiscountItem => ({ lineTotal, vatType: 'EXEMPT', scDiscountExempt: false })
const zero    = (lineTotal: number): DiscountItem => ({ lineTotal, vatType: 'ZERO_RATED', scDiscountExempt: false })
const h = (t: HolderType) => ({ holderType: t, holderName: 'N', holderId: 'ID' })

describe('computeSale — no holder', () => {
  it('splits a VATABLE cart into net sales + VAT', () => {
    const r = computeSale([vatable(112)], [], 1)
    expect(r.vat.vatableSales).toBeCloseTo(100, 2)
    expect(r.vat.vatAmount).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(112, 2)
    expect(r.discount).toBe(0)
  })
  it('classifies EXEMPT and ZERO_RATED separately', () => {
    const r = computeSale([vatable(112), exempt(50), zero(30)], [], 1)
    expect(r.vat.vatableSales).toBeCloseTo(100, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(50, 2)
    expect(r.vat.zeroRatedSales).toBeCloseTo(30, 2)
    expect(r.amountDue).toBeCloseTo(192, 2)
  })
})

describe('computeSale — single SC/PWD (party of 1)', () => {
  it('removes VAT and gives 20% off the net base', () => {
    const r = computeSale([vatable(112)], [h('SC')], 1)
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.amountDue).toBeCloseTo(80, 2)
    expect(r.vat.vatableSales).toBeCloseTo(0, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(100, 2)
  })
  it('excludes scDiscountExempt items (e.g. liquor) from the eligible base', () => {
    const r = computeSale([vatable(112), vatable(50, true)], [h('PWD')], 1)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.vatExemptReduction).toBeCloseTo(12, 2)
    expect(r.amountDue).toBeCloseTo(130, 2)
  })
  it('gives 20% off an EXEMPT item at face value with no VAT step-down', () => {
    const r = computeSale([exempt(112)], [h('SC')], 1)
    expect(r.discount).toBeCloseTo(22.4, 2)
    expect(r.vatExemptReduction).toBeCloseTo(0, 2)
    expect(r.amountDue).toBeCloseTo(89.6, 2)
  })
})

describe('computeSale — Solo Parent (party of 1)', () => {
  it('gives 10% off eligible with no VAT exemption', () => {
    const r = computeSale([vatable(200)], [h('SOLO_PARENT')], 1)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.vatExemptReduction).toBe(0)
    expect(r.amountDue).toBeCloseTo(180, 2)
    expect(r.vat.vatableSales).toBeCloseTo(178.57, 2)
  })
})

describe('computeSale — multiple holders + party size', () => {
  it('2 SC in a party of 4 → discount on half the eligible base', () => {
    const r = computeSale([vatable(112)], [h('SC'), h('SC')], 4)
    expect(r.discount).toBeCloseTo(10, 2)
    expect(r.vatExemptReduction).toBeCloseTo(6, 2)
    expect(r.amountDue).toBeCloseTo(96, 2)
    expect(r.vat.vatableSales).toBeCloseTo(50, 2)
    expect(r.vat.vatAmount).toBeCloseTo(6, 2)
    expect(r.vat.vatExemptSales).toBeCloseTo(50, 2)
  })
  it('party size is clamped to at least the number of holders', () => {
    const r = computeSale([vatable(112)], [h('SC'), h('SC')], 1)
    expect(r.discount).toBeCloseTo(20, 2)
    expect(r.amountDue).toBeCloseTo(80, 2)
  })
})
