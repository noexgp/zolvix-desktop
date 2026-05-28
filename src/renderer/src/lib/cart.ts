import type { CachedProduct } from '@/lib/db'

export interface CartItem {
  product: CachedProduct
  quantity: number
}

export interface PaymentEntry {
  id: string
  method: 'cash' | 'card' | 'ewallet' | 'check' | 'charge' | 'gc' | null
  amount: number
  cashTendered?: number
  cardProvider?: string
  ewalletProvider?: string
  approvalCode?: string
  referenceNo?: string
  checkNumber?: string
  bankName?: string
  checkDate?: string
  checkPayorName?: string
}

export function lineTotal(product: CachedProduct, quantity: number): number {
  return Math.round(product.price * quantity * 100) / 100
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + lineTotal(item.product, item.quantity), 0)
}

export function paymentTotal(payments: PaymentEntry[]): number {
  return payments.reduce((sum, p) => sum + (p.amount || 0), 0)
}

export function remaining(total: number, payments: PaymentEntry[]): number {
  return Math.max(0, total - paymentTotal(payments))
}
