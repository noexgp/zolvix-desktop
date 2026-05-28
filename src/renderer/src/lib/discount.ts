export type HolderType = 'SC' | 'PWD' | 'SOLO_PARENT'

export interface DiscountItem {
  lineTotal: number          // unit price × qty (VAT-inclusive)
  vatType: string            // VATABLE | EXEMPT | ZERO_RATED
  scDiscountExempt: boolean
}

export interface VatBreakdown {
  vatableSales: number
  vatAmount: number
  vatExemptSales: number
  zeroRatedSales: number
}

export interface SaleCalc {
  grossSubtotal: number
  discount: number
  vatExemptReduction: number
  amountDue: number
  vat: VatBreakdown
}

const VAT_DIVISOR = 1.12
const r2 = (n: number) => Math.round(n * 100) / 100

export function computeSale(items: DiscountItem[], holderType: HolderType | null): SaleCalc {
  let vatableSales = 0
  let vatAmount = 0
  let vatExemptSales = 0
  let zeroRatedSales = 0
  let gross = 0

  for (const it of items) {
    gross += it.lineTotal
    if (it.vatType === 'EXEMPT') {
      vatExemptSales += it.lineTotal
    } else if (it.vatType === 'ZERO_RATED') {
      zeroRatedSales += it.lineTotal
    } else {
      const net = it.lineTotal / VAT_DIVISOR
      vatableSales += net
      vatAmount += it.lineTotal - net
    }
  }

  let discount = 0
  let vatExemptReduction = 0

  if (holderType === 'SC' || holderType === 'PWD') {
    const eligibleBase = items
      .filter(i => i.vatType !== 'EXEMPT' && i.vatType !== 'ZERO_RATED' && !i.scDiscountExempt)
      .reduce((s, i) => s + i.lineTotal, 0)
    const netBase = eligibleBase / VAT_DIVISOR
    vatExemptReduction = eligibleBase - netBase
    discount = netBase * 0.20
    vatableSales -= netBase
    vatAmount -= vatExemptReduction
    vatExemptSales += netBase
  } else if (holderType === 'SOLO_PARENT') {
    const eligibleGross = items.filter(i => !i.scDiscountExempt).reduce((s, i) => s + i.lineTotal, 0)
    discount = eligibleGross * 0.10
  }

  return {
    grossSubtotal: r2(gross),
    discount: r2(discount),
    vatExemptReduction: r2(vatExemptReduction),
    amountDue: r2(gross - vatExemptReduction - discount),
    vat: {
      vatableSales: r2(Math.max(0, vatableSales)),
      vatAmount: r2(Math.max(0, vatAmount)),
      vatExemptSales: r2(Math.max(0, vatExemptSales)),
      zeroRatedSales: r2(Math.max(0, zeroRatedSales)),
    },
  }
}

export const HOLDER_LABELS: Record<HolderType, string> = {
  SC: 'Senior Citizen',
  PWD: 'PWD',
  SOLO_PARENT: 'Solo Parent',
}
