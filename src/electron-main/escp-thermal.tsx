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

// ESC M n — select character font. 1 = Font B (smaller), 0 = Font A (normal).
const FONT_B = new Uint8Array([0x1b, 0x4d, 0x01])
const FONT_A = new Uint8Array([0x1b, 0x4d, 0x00])

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
  const l = String(label ?? '')
  const r = String(right ?? '')
  return l.substring(0, width - RIGHT_COL).padEnd(width - RIGHT_COL) + r.padStart(RIGHT_COL)
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', ewallet: 'E-wallet', check: 'Check', charge: 'Charge', gc: 'Gift Cert',
}
// Payments may arrive pre-formatted ({label}) from checkout, or raw from the API
// invoice ({method}); derive a display label either way.
function paymentLabel(p: { label?: string; method?: string }): string {
  return p.label || (p.method ? METHOD_LABELS[p.method] ?? p.method : '') || 'Payment'
}

// Word-wrap a string to the paper width at word boundaries (react-thermal-printer
// does not wrap plain <Text>, so we do it ourselves to avoid mid-word breaks).
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word
    else if ((line + ' ' + word).length <= width) line += ' ' + word
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
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
  payments?: Array<{ label?: string; detail?: string; amount: number | string; method?: string }>
  vat?: { vatableSales: number; vatAmount: number; vatExemptSales: number; zeroRatedSales: number }
  discount?: { label: string; amount: number }
  holders?: Array<{ type: string; name: string; id: string }>
  withSignature?: boolean
  copyLabel?: string
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
  const v = inv.vat
  const vatableSales = v ? v.vatableSales : (bir.vatRegistered ? round2(total / (1 + rate / 100)) : 0)
  const vatAmount    = v ? v.vatAmount    : (bir.vatRegistered ? round2(total - vatableSales) : 0)
  const vatExempt    = v ? v.vatExemptSales : 0
  const zeroRated    = v ? v.zeroRatedSales : 0

  return (
    <Printer type='epson' width={width}>
      {/* ── Header ── */}
      {businessName && <Text align='center' bold>{businessName}</Text>}
      {bir.address && wrapWords(bir.address, width).map((l, i) => <Text key={`addr-${i}`} align='center'>{l}</Text>)}
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
          <Text>{kv('VATable Sales', fmtAmount(vatableSales), width)}</Text>
          <Text>{kv('VAT-Exempt Sales', fmtAmount(vatExempt), width)}</Text>
          <Text>{kv('Zero-Rated Sales', fmtAmount(zeroRated), width)}</Text>
          <Text>{kv(`VAT (${rate}%)`, fmtAmount(vatAmount), width)}</Text>
        </>
      ) : (
        <Text align='center'>NOT VALID FOR CLAIMING INPUT TAX</Text>
      )}

      <Line character='=' />
      {inv.discount && inv.discount.amount > 0 && (
        <Text>{kv(`Less: ${inv.discount.label}`, '-' + fmtAmount(inv.discount.amount), width)}</Text>
      )}
      <Text bold>{kv('TOTAL AMOUNT DUE', fmtAmount(total), width)}</Text>

      {/* ── Payment breakdown ── */}
      {inv.payments && inv.payments.length > 0 && (
        <>
          <Line />
          {inv.payments.map((p, i) => (
            <React.Fragment key={i}>
              <Text>{kv(paymentLabel(p), fmtAmount(p.amount), width)}</Text>
              {p.detail && <Text>{`  ${p.detail}`}</Text>}
            </React.Fragment>
          ))}
        </>
      )}

      {/* ── Tendered / change ── */}
      {inv.cashTendered != null && inv.cashTendered > 0 && (
        <Text>{kv('Cash Tendered', fmtAmount(inv.cashTendered), width)}</Text>
      )}
      {inv.change != null && inv.change > 0 && (
        <Text>{kv('Change', fmtAmount(inv.change), width)}</Text>
      )}

      {inv.holders && inv.holders.length > 0 && (
        <>
          <Br />
          {inv.holders.flatMap((hld, idx) => {
            const lines = [
              <Text key={`hn${idx}`}>{`${hld.type} Name: ${hld.name}`}</Text>,
              <Text key={`hi${idx}`}>{`ID No: ${hld.id}`}</Text>,
            ]
            if (inv.withSignature) lines.push(<Text key={`hs${idx}`}>Signature: ____________________</Text>)
            return lines
          })}
        </>
      )}
      {inv.copyLabel && (
        <>
          <Br />
          <Text align="center">{inv.copyLabel}</Text>
        </>
      )}

      <Line character='=' />

      {/* ── BIR footer (smaller Font B fine-print) ── */}
      <Raw data={FONT_B} />
      <Text align='center' bold>THIS SERVES AS YOUR SALES INVOICE</Text>
      {wrapWords('This invoice shall be valid for five (5) years from the date of the Permit to Use.', width).map((l, i) => (
        <Text key={`val-${i}`} align='center'>{l}</Text>
      ))}
      <Br />
      {bir.ptuNo && <Text align='center'>{`PTU No: ${bir.ptuNo}`}</Text>}
      {bir.min && <Text align='center'>{`MIN: ${bir.min}`}</Text>}
      {bir.serialNo && <Text align='center'>{`Serial No: ${bir.serialNo}`}</Text>}
      {bir.accreditation && <Text align='center'>{`Accred: ${bir.accreditation}`}</Text>}
      {bir.softwareProvider && (
        <>
          <Br />
          <Text align='center'>{bir.softwareProvider}</Text>
          {bir.softwareTin && <Text align='center'>{`TIN: ${bir.softwareTin}`}</Text>}
        </>
      )}
      <Raw data={FONT_A} />
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
  accreditation: '', softwareProvider: '', softwareTin: '', footerNote: '',
}

export async function buildThermalBuffer(
  inv: ThermalInvoiceData,
  paperType: string,
  bir: BirConfig = EMPTY_BIR,
): Promise<Buffer> {
  const data = await render(buildEscPosReceipt(inv, paperType, bir) as any)
  return Buffer.from(data)
}
