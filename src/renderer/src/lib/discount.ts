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

export interface Holder {
  holderType: HolderType
  holderName: string
  holderId: string
}

export interface PrivilegedDiscount {
  holders: Holder[]
  partySize: number
}

export function computeSale(
  items: DiscountItem[],
  holders: { holderType: HolderType }[],
  partySize: number,
): SaleCalc {
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

  if (holders.length > 0) {
    const party = Math.max(partySize, holders.length)
    const scPwdCount = holders.filter(h => h.holderType === 'SC' || h.holderType === 'PWD').length
    const spCount = holders.filter(h => h.holderType === 'SOLO_PARENT').length
    const scPwdFraction = scPwdCount / party
    const spFraction = spCount / party

    const eligible = items.filter(i => !i.scDiscountExempt)
    const isVatable = (t: string) => t !== 'EXEMPT' && t !== 'ZERO_RATED'
    const vatableEligible = eligible.filter(i => isVatable(i.vatType)).reduce((s, i) => s + i.lineTotal, 0)
    const exemptEligible = eligible.filter(i => !isVatable(i.vatType)).reduce((s, i) => s + i.lineTotal, 0)
    const netBase = vatableEligible / VAT_DIVISOR

    const scPwdDiscount = (netBase + exemptEligible) * 0.20 * scPwdFraction
    const scPwdVatReduction = (vatableEligible - netBase) * scPwdFraction
    const scPwdExemptNet = netBase * scPwdFraction
    const spDiscount = (vatableEligible + exemptEligible) * 0.10 * spFraction

    discount = scPwdDiscount + spDiscount
    vatExemptReduction = scPwdVatReduction
    vatableSales -= scPwdExemptNet
    vatAmount -= scPwdVatReduction
    vatExemptSales += scPwdExemptNet
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
