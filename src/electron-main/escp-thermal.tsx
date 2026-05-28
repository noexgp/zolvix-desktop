import React from 'react'
import { Printer, Text, Line, Raw, Br, render } from 'react-thermal-printer'

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
  return n.toFixed(2) // no currency symbol, stable 2 decimals
}

const RIGHT_COL = 10 // fixed amount column width

// Total line: "TOTAL:          290.87"
function totalLine(right: string, width: number): string {
  return 'TOTAL:'.padEnd(width - RIGHT_COL) + right.padStart(RIGHT_COL)
}

// Two lines per item:
//   Line 1: item name (full, no truncation)
//   Line 2: "  qty x unitPrice          total"
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
  customer?: { name?: string }
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
): React.ReactElement {
  const width = COLS_BY_PAPER[paperType] ?? 32
  const date = new Date(inv.createdAt).toLocaleDateString('en-PH')

  return (
    <Printer type='epson' width={width}>
      {inv.businessName && (
        <Text align='center' bold>
          {inv.businessName}
        </Text>
      )}

      <Text>{`${inv.invoiceNumber}`}</Text>
      <Text>{`Customer: ${inv.customer?.name ?? 'Walk-in'}`}</Text>
      <Text>{`Date: ${date}`}</Text>

      <Line />

      {(inv.details ?? []).map((d, i) =>
        itemLines(
          d.product?.name ?? '',
          d.quantity,
          d.unitPrice,
          d.total,
          width,
        ).map((l, j) => <Text key={`${i}-${j}`}>{l}</Text>),
      )}

      <Line character='=' />

      <Text bold>{totalLine(fmtAmount(inv.totalAmount), width)}</Text>

      <Br />

      <Text align='center'>Thank you!</Text>

      <Br />

      <Raw data={CUT_RAW} />
    </Printer>
  )
}

export async function buildThermalBuffer(
  inv: ThermalInvoiceData,
  paperType: string,
): Promise<Buffer> {
  const data = await render(buildEscPosReceipt(inv, paperType) as any)
  return Buffer.from(data)
}
