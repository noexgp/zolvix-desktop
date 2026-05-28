import { describe, it, expect } from 'vitest'
import { lineTotal, cartTotal, paymentTotal, remaining } from '../cart'

const p = (price: number) => ({ id: '1', name: 'Item', price, stock: 10, sku: '', categoryId: '', isActive: true, updatedAt: '' })

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
