import { describe, it, expect } from 'vitest'
import { lineTotal, cartTotal, paymentTotal, remaining, pesoToPct, clampPct, lineNet, lineDiscountAmount } from '../cart'
import type { CartItem } from '../cart'

const p = (price: number) => ({ id: '1', name: 'Item', price, stock: 10, sku: '', categoryId: '', isActive: true, updatedAt: '' })
const item = (price: number, quantity: number, discountPct?: number): CartItem => ({ product: p(price), quantity, discountPct })

describe('lineTotal', () => {
  it('multiplies price by quantity', () => {
    expect(lineTotal(p(25), 3)).toBe(75)
  })
  it('handles decimal prices', () => {
    expect(lineTotal(p(12.5), 2)).toBe(25)
  })
})

describe('cartTotal', () => {
  it('sums all line totals', () => {
    const items = [
      { product: p(25), quantity: 2 },
      { product: p(75), quantity: 1 },
    ]
    expect(cartTotal(items)).toBe(125)
  })
  it('returns 0 for empty cart', () => {
    expect(cartTotal([])).toBe(0)
  })
  it('rounds accumulated total correctly', () => {
    const items = [
      { product: p(0.1), quantity: 3 },   // 0.30
      { product: p(19.99), quantity: 2 }, // 39.98
      { product: p(5.55), quantity: 1 },  // 5.55
    ]
    expect(cartTotal(items)).toBe(45.83)
  })
})

describe('paymentTotal', () => {
  it('sums payment amounts', () => {
    expect(paymentTotal([{ id: '1', method: 'cash', amount: 100 }, { id: '2', method: 'card', amount: 80 }])).toBe(180)
  })
})

describe('remaining', () => {
  it('returns 0 when fully paid', () => {
    expect(remaining(100, [{ id: '1', method: 'cash', amount: 100 }])).toBe(0)
  })
  it('returns positive when underpaid', () => {
    expect(remaining(150, [{ id: '1', method: 'cash', amount: 100 }])).toBe(50)
  })
  it('never returns negative', () => {
    expect(remaining(100, [{ id: '1', method: 'cash', amount: 200 }])).toBe(0)
  })
})

describe('clampPct', () => {
  it('clamps to 0..100 and rounds to 4 dp', () => {
    expect(clampPct(150)).toBe(100)
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(33.333333)).toBe(33.3333)
  })
})

describe('pesoToPct', () => {
  it('converts peso to a 4-dp percent of the line gross', () => {
    expect(pesoToPct(50, 150)).toBe(33.3333)
    expect(pesoToPct(50, 200)).toBe(25)
  })
  it('caps at 100% when peso >= gross', () => {
    expect(pesoToPct(300, 150)).toBe(100)
  })
  it('is 0 when gross is 0', () => {
    expect(pesoToPct(50, 0)).toBe(0)
  })
})

describe('lineNet / lineDiscountAmount', () => {
  it('no discount → gross', () => {
    expect(lineNet(item(150, 1))).toBe(150)
    expect(lineDiscountAmount(item(150, 1))).toBe(0)
  })
  it('33.3333% off ₱150 → ₱100.00 net, ₱50.00 off', () => {
    const it = item(150, 1, 33.3333)
    expect(lineDiscountAmount(it)).toBe(50)
    expect(lineNet(it)).toBe(100)
  })
  it('applies to qty', () => {
    const it = item(100, 2, 10)
    expect(lineDiscountAmount(it)).toBe(20)
    expect(lineNet(it)).toBe(180)
  })
})
