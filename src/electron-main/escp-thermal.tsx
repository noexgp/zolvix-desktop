import React from 'react'
import { Printer, Text, Line, Raw, Br, render } from 'react-thermal-printer'
import type { BirConfig } from './store'

const COLS_BY_PAPER: Record<string, number> = {
  '80mm': 42,
  '58mm': 30,
  '76mm': 32,
}

// ESC/POS full cut
const CUT_RAW = new Uint8Array([
  0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00,
])

function fmtAmount(v: number | string): string {
  const n = Number(v) || 0
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const RIGHT_COL = 10 // fixed amount column width

// "Label .......... 290.87" — label left, amount right-aligned in RIGHT_COL.
function kv(label: string, right: string, width: number): string {
  return label.substring(0, width - RIGHT_COL).padEnd(width - RIGHT_COL) + right.padStart(RIGHT_COL)
}

// Two lines per item: name, then "  qty x unitPrice         total"
function itemLines(
  name: string,
  qty: number,
  unitPrice: number | string,
  total: number | string,
  width: number,
): string[] {
  const detail = `  ${qty} x ${fmtAmount(unitPrice)}`
  const amt = fmtAmount(total).padStart(RIGHT_COL)
  const gap = width - detail.length - RIGHT_COL
  const line2 = detail + ' '.repeat(Math.max(1, gap)) + amt
  return [name, line2]
}

export interface ThermalInvoiceData {
  invoiceNumber: string
  totalAmount: number | string
  createdAt: string
  businessName?: string
  cashier?: string
  cashTendered?: number
  change?: number
  customer?: { name?: string; address?: string; tin?: string }
  details?: Array<{
    quantity: number
    unitPrice: number | string
    total: number | string
    product?: { name?: string }
  }>
}

function buildEscPosReceipt(
  inv: ThermalInvoiceData,
  paperType: string,
  bir: BirConfig,
): React.ReactElement {
  const width = COLS_BY_PAPER[paperType] ?? 32
  const dt = new Date(inv.createdAt)
  const date = dt.toLocaleDateString('en-PH')
  const time = dt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

  const businessName = bir.businessName || inv.businessName || ''
  const total = Number(inv.totalAmount) || 0
  const rate = bir.vatRate || 12
  const vatable = bir.vatRegistered ? round2(total / (1 + rate / 100)) : 0
  const vat = bir.vatRegistered ? round2(total - vatable) : 0

  return (
    <Printer type='epson' width={width}>
      {/* ── Header ── */}
      {businessName && <Text align='center' bold>{businessName}</Text>}
      {bir.address && <Text align='center'>{bir.address}</Text>}
      {bir.tin && (
        <Text align='center'>
          {`${bir.vatRegistered ? 'VAT REG' : 'NON-VAT'} TIN: ${bir.tin}`}
        </Text>
      )}

      <Line character='=' />
      <Text align='center' bold>{bir.invoiceTitle || 'SALES INVOICE'}</Text>
      <Line />

      {/* ── Transaction meta ── */}
      <Text>{`Invoice No : ${inv.invoiceNumber}`}</Text>
      <Text>{`Date/Time  : ${date} ${time}`}</Text>
      {inv.cashier && <Text>{`Cashier    : ${inv.cashier}`}</Text>}

      {/* ── Buyer (B2B) ── */}
      {inv.customer?.name && <Text>{`Sold To    : ${inv.customer.name}`}</Text>}
      {inv.customer?.address && <Text>{`Address    : ${inv.customer.address}`}</Text>}
      {inv.customer?.tin && <Text>{`TIN        : ${inv.customer.tin}`}</Text>}

      <Line />

      {/* ── Items ── */}
      {(inv.details ?? []).map((d, i) =>
        itemLines(d.product?.name ?? '', d.quantity, d.unitPrice, d.total, width).map((l, j) => (
          <Text key={`${i}-${j}`}>{l}</Text>
        )),
      )}

      <Line />

      {/* ── VAT breakdown ── */}
      {bir.vatRegistered ? (
        <>
          <Text>{kv('VATable Sales', fmtAmount(vatable), width)}</Text>
          <Text>{kv('VAT-Exempt Sales', fmtAmount(0), width)}</Text>
          <Text>{kv('Zero-Rated Sales', fmtAmount(0), width)}</Text>
          <Text>{kv(`VAT (${rate}%)`, fmtAmount(vat), width)}</Text>
        </>
      ) : (
        <Text align='center'>NOT VALID FOR CLAIMING INPUT TAX</Text>
      )}

      <Line character='=' />
      <Text bold>{kv('TOTAL AMOUNT DUE', fmtAmount(total), width)}</Text>

      {/* ── Tendered / change ── */}
      {inv.cashTendered != null && inv.cashTendered > 0 && (
        <Text>{kv('Cash Tendered', fmtAmount(inv.cashTendered), width)}</Text>
      )}
      {inv.change != null && inv.change > 0 && (
        <Text>{kv('Change', fmtAmount(inv.change), width)}</Text>
      )}

      <Line character='=' />

      {/* ── BIR footer ── */}
      <Text align='center'>This invoice is valid for five (5)</Text>
      <Text align='center'>years from the date of the PTU.</Text>
      <Br />
      {bir.ptuNo && <Text align='center'>{`PTU No: ${bir.ptuNo}`}</Text>}
      {bir.min && <Text align='center'>{`MIN: ${bir.min}`}</Text>}
      {bir.serialNo && <Text align='center'>{`Serial No: ${bir.serialNo}`}</Text>}
      {bir.accreditation && <Text align='center'>{`Accred: ${bir.accreditation}`}</Text>}
      {bir.softwareProvider && (
        <>
          <Br />
          <Text align='center'>{bir.softwareProvider}</Text>
        </>
      )}
      <Br />
      <Text align='center'>{bir.footerNote || 'Thank you, come again!'}</Text>
      <Br />

      <Raw data={CUT_RAW} />
    </Printer>
  )
}

const EMPTY_BIR: BirConfig = {
  businessName: '', address: '', tin: '', vatRegistered: true, vatRate: 12,
  invoiceTitle: 'SALES INVOICE', ptuNo: '', min: '', serialNo: '',
  accreditation: '', softwareProvider: '', footerNote: '',
}

export async function buildThermalBuffer(
  inv: ThermalInvoiceData,
  paperType: string,
  bir: BirConfig = EMPTY_BIR,
): Promise<Buffer> {
  const data = await render(buildEscPosReceipt(inv, paperType, bir) as any)
  return Buffer.from(data)
}
