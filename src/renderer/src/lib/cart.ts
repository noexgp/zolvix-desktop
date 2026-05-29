import type { CachedProduct } from '@/lib/db'

export interface CartItem {
  product: CachedProduct
  quantity: number
  discountPct?: number // line discount as a percent, 4 dp; undefined/0 = none
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
  const total = items.reduce((sum, item) => sum + lineTotal(item.product, item.quantity), 0)
  return Math.round(total * 100) / 100
}

export function paymentTotal(payments: PaymentEntry[]): number {
  return payments.reduce((sum, p) => sum + (p.amount || 0), 0)
}

export function remaining(total: number, payments: PaymentEntry[]): number {
  return Math.max(0, total - paymentTotal(payments))
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

export function clampPct(p: number): number {
  return round4(Math.min(100, Math.max(0, p)))
}

export function pesoToPct(peso: number, lineGross: number): number {
  if (lineGross <= 0) return 0
  return clampPct((peso / lineGross) * 100)
}

export function lineDiscountAmount(item: CartItem): number {
  const gross = lineTotal(item.product, item.quantity)
  return round2(gross * (item.discountPct ?? 0) / 100)
}

export function lineNet(item: CartItem): number {
  return round2(lineTotal(item.product, item.quantity) - lineDiscountAmount(item))
}
