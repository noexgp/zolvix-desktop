// src/electron-main/escp-builder.ts

const ESC = 0x1b
const CR = 0x0d
const LF = 0x0a
const FF = 0x0c  // Form feed / page eject

function strBytes(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out.push(c >= 0x20 && c <= 0x7e ? c : 0x3f) // printable ASCII or '?'
  }
  return out
}
function line(s: string): number[] { return [...strBytes(s), CR, LF] }
function padEnd(s: string, len: number): string { return s.substring(0, len).padEnd(len) }
function padStart(s: string, len: number): string { return s.substring(0, len).padStart(len) }

export interface InvoiceData {
  invoiceNumber: string
  totalAmount: number | string
  createdAt: string
  customer?: { name?: string }
  details?: Array<{
    quantity: number
    unitPrice: number | string
    total: number | string
    product?: { name?: string }
  }>
}

function setPageLength(heightIn: number): number[] {
  // ESC C 0 n — set page length in 1/360-inch units
  const units = Math.round(heightIn * 360)
  return [ESC, 0x43, 0x00, units & 0xff]
}

export function buildEscpPlain(inv: InvoiceData, paper = { width: 8.5, height: 11 }): Buffer {
  const bytes: number[] = []

  // Initialize printer
  bytes.push(ESC, 0x40)
  bytes.push(...setPageLength(paper.height))

  bytes.push(...line(`Invoice: ${inv.invoiceNumber}`))
  bytes.push(...line(`Customer: ${inv.customer?.name ?? 'Walk-in'}`))
  bytes.push(...line(`Date: ${new Date(inv.createdAt).toLocaleDateString('en-PH')}`))
  bytes.push(...line('-'.repeat(60)))
  bytes.push(...line(`${'Product'.padEnd(34)}${'Qty'.padStart(6)}${'Price'.padStart(10)}${'Total'.padStart(10)}`))
  bytes.push(...line('-'.repeat(60)))

  for (const d of inv.details ?? []) {
    const name = padEnd(d.product?.name ?? '', 34)
    const qty = padStart(String(d.quantity), 6)
    const price = padStart(`P${Number(d.unitPrice).toLocaleString()}`, 10)
    const total = padStart(`P${Number(d.total).toLocaleString()}`, 10)
    bytes.push(...line(`${name}${qty}${price}${total}`))
  }

  bytes.push(...line('-'.repeat(60)))
  bytes.push(...line(`${'TOTAL:'.padEnd(50)}${padStart(`P${Number(inv.totalAmount).toLocaleString()}`, 10)}`))
  bytes.push(FF)

  return Buffer.from(bytes)
}

export function buildEscpPreprinted(inv: InvoiceData, offsets: { row: number; col: number }, paper = { width: 8.5, height: 11 }): Buffer {
  const bytes: number[] = []
  bytes.push(ESC, 0x40)
  bytes.push(...setPageLength(paper.height))

  // Advance to starting row
  for (let i = 0; i < offsets.row; i++) bytes.push(LF)

  // Invoice number
  bytes.push(...strBytes(' '.repeat(offsets.col)))
  bytes.push(...line(inv.invoiceNumber))

  // Customer name
  bytes.push(...strBytes(' '.repeat(offsets.col)))
  bytes.push(...line(inv.customer?.name ?? 'Walk-in'))

  // Date
  bytes.push(...strBytes(' '.repeat(offsets.col)))
  bytes.push(...line(new Date(inv.createdAt).toLocaleDateString('en-PH')))

  // Line items — max 10 on typical pre-printed form
  for (const d of (inv.details ?? []).slice(0, 10)) {
    bytes.push(...strBytes(' '.repeat(offsets.col)))
    const name = padEnd(d.product?.name ?? '', 28)
    const qty = padStart(String(d.quantity), 6)
    const total = padStart(`P${Number(d.total).toLocaleString()}`, 12)
    bytes.push(...line(`${name}${qty}${total}`))
  }

  // Total line
  bytes.push(...strBytes(' '.repeat(offsets.col + 34)))
  bytes.push(...line(padStart(`P${Number(inv.totalAmount).toLocaleString()}`, 12)))

  bytes.push(FF)
  return Buffer.from(bytes)
}
