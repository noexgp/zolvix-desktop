import React from 'react'
import { pdf, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import NotoSansRegularUrl from '@/assets/fonts/NotoSans-Regular.ttf?url'
import NotoSansBoldUrl from '@/assets/fonts/NotoSans-Bold.ttf?url'

// @react-pdf/renderer cannot fetch Vite asset URLs directly in Electron.
// Fetch font bytes via browser fetch, convert to base64 data URL using FileReader.
let fontsReady = false
async function ensureFonts(): Promise<void> {
  if (fontsReady) return
  const toDataUrl = (url: string): Promise<string> =>
    fetch(url)
      .then(r => r.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }))
  const [regular, bold] = await Promise.all([toDataUrl(NotoSansRegularUrl), toDataUrl(NotoSansBoldUrl)])
  Font.register({ family: 'NotoSans', fonts: [{ src: regular, fontWeight: 'normal' }, { src: bold, fontWeight: 'bold' }] })
  fontsReady = true
}

const BLUE = '#2563eb'
const DARK = '#0f172a'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const WHITE = '#ffffff'

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingHorizontal: 40,
    paddingBottom: 120,
    fontFamily: 'NotoSans',
    fontSize: 9,
    color: DARK,
    backgroundColor: WHITE,
  },
  // ── Header ──
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  brandName: { fontSize: 18, fontWeight: 'bold', color: BLUE },
  brandSub: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  docRight: { alignItems: 'flex-end' },
  docType: { fontSize: 20, fontWeight: 'bold', color: DARK, textAlign: 'right' },
  docNumber: { fontSize: 10, fontWeight: 'bold', color: DARK, textAlign: 'right', marginTop: 4 },
  docMeta: { fontSize: 8, color: MUTED, textAlign: 'right', marginTop: 2 },
  divider: { borderBottomWidth: 2, borderBottomColor: BLUE, borderBottomStyle: 'solid', marginBottom: 14 },
  // ── Info panels ──
  infoRow: { flexDirection: 'row', marginBottom: 14 },
  infoBoxLeft: { flex: 1, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', marginRight: 8 },
  infoBoxRight: { flex: 1, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid' },
  infoHeader: { backgroundColor: BLUE, paddingHorizontal: 10, paddingVertical: 5 },
  infoHeaderText: { color: WHITE, fontWeight: 'bold', fontSize: 7.5 },
  infoBody: { padding: 10 },
  infoName: { fontWeight: 'bold', fontSize: 9, marginBottom: 3 },
  infoLine: { fontSize: 8, color: MUTED, marginBottom: 1.5 },
  // ── Table ──
  tableHead: { flexDirection: 'row', backgroundColor: BLUE, paddingHorizontal: 10, paddingVertical: 6 },
  thText: { color: WHITE, fontWeight: 'bold', fontSize: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid', paddingHorizontal: 10, paddingVertical: 6 },
  tdText: { fontSize: 9 },
  tdSub: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  colNum: { width: 18 },
  colProduct: { flex: 1 },
  colQty: { width: 50, textAlign: 'right' },
  colPrice: { width: 72, textAlign: 'right' },
  colAmount: { width: 72, textAlign: 'right' },
  // ── Totals ──
  totalsSection: { alignItems: 'flex-end', marginTop: 6, marginBottom: 24 },
  subtotalRow: { flexDirection: 'row', width: 220, marginBottom: 3 },
  subtotalLabel: { flex: 1, fontSize: 8, color: MUTED },
  subtotalValue: { fontSize: 8, color: MUTED, textAlign: 'right' },
  totalBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: BLUE, paddingHorizontal: 14, paddingVertical: 9,
    width: 260, marginTop: 6,
  },
  totalLabel: { fontSize: 9, fontWeight: 'bold', color: WHITE },
  totalAmount: { fontSize: 16, fontWeight: 'bold', color: WHITE },
  // ── Signature (absolute at bottom) ──
  signWrapper: { position: 'absolute', bottom: 56, left: 40, right: 40 },
  signRow: { flexDirection: 'row' },
  signCol: { flex: 1, paddingRight: 16 },
  signName: { fontWeight: 'bold', fontSize: 9, marginBottom: 18 },
  signLine: { borderBottomWidth: 0.5, borderBottomColor: '#94a3b8', borderBottomStyle: 'solid', marginBottom: 4 },
  signLabel: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  // ── Footer (absolute at bottom) ──
  footerWrapper: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid', paddingTop: 6 },
  footerText: { fontSize: 7.5, color: MUTED },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | string) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''
}

function generatedOn() {
  return new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface DocDetail {
  id: string
  quantity: number
  unitPrice: number | string
  total: number | string
  product?: { name?: string; sku?: string }
}

interface CustomerInfo {
  name?: string
  address?: string
  phone?: string
  email?: string
}

interface InvoiceDoc {
  invoiceNumber: string
  totalAmount: number | string
  createdAt: string
  status?: string
  discount?: number | string
  discountMode?: string
  deliveryFee?: number | string
  soNumber?: string | null
  customer?: CustomerInfo | null
  details?: DocDetail[]
}

interface SODoc {
  soNumber: string
  totalAmount: number | string
  orderDate?: string
  createdAt?: string
  status?: string
  discount?: number | string
  discountMode?: string
  deliveryFee?: number | string
  customer?: CustomerInfo | null
  employee?: { name?: string } | null
  approvedBy?: { name?: string } | null
  details?: DocDetail[]
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function InfoBox({ side, title, children }: { side: 'left' | 'right'; title: string; children: React.ReactNode }) {
  return (
    <View style={side === 'left' ? s.infoBoxLeft : s.infoBoxRight}>
      <View style={s.infoHeader}>
        <Text style={s.infoHeaderText}>{title}</Text>
      </View>
      <View style={s.infoBody}>{children}</View>
    </View>
  )
}

function ItemsTable({ details, columns }: {
  details: DocDetail[]
  columns: { qty: string; price: string; amount: string }
}) {
  return (
    <View style={{ marginBottom: 0 }}>
      <View style={s.tableHead}>
        <Text style={[s.thText, s.colNum]}>#</Text>
        <Text style={[s.thText, s.colProduct]}>PRODUCT / DESCRIPTION</Text>
        <Text style={[s.thText, s.colQty]}>{columns.qty}</Text>
        <Text style={[s.thText, s.colPrice]}>{columns.price}</Text>
        <Text style={[s.thText, s.colAmount]}>{columns.amount}</Text>
      </View>
      {details.map((d, i) => (
        <View key={d.id ?? i} style={s.tableRow}>
          <Text style={[s.tdText, s.colNum]}>{i + 1}</Text>
          <View style={s.colProduct}>
            <Text style={s.tdText}>{d.product?.name ?? '—'}</Text>
            {d.product?.sku ? <Text style={s.tdSub}>SKU: {d.product.sku}</Text> : null}
          </View>
          <Text style={[s.tdText, s.colQty]}>{d.quantity}</Text>
          <Text style={[s.tdText, s.colPrice]}>{fmt(d.unitPrice)}</Text>
          <Text style={[s.tdText, s.colAmount]}>{fmt(d.total)}</Text>
        </View>
      ))}
    </View>
  )
}

function TotalsBlock({ linesTotal, discount, discountMode, deliveryFee, totalAmount }: {
  linesTotal: number
  discount: number
  discountMode: string
  deliveryFee: number
  totalAmount: number | string
}) {
  const discAmt = discountMode === 'AMOUNT' ? discount : linesTotal * (discount / 100)
  const showDiscount = discount > 0
  const showFee = deliveryFee > 0

  return (
    <View style={s.totalsSection}>
      {showDiscount && (
        <>
          <View style={s.subtotalRow}>
            <Text style={s.subtotalLabel}>Subtotal</Text>
            <Text style={s.subtotalValue}>{fmt(linesTotal)}</Text>
          </View>
          <View style={s.subtotalRow}>
            <Text style={s.subtotalLabel}>Discount{discountMode === 'PERCENT' ? ` (${discount}%)` : ''}</Text>
            <Text style={s.subtotalValue}>-{fmt(discAmt)}</Text>
          </View>
        </>
      )}
      {showFee && (
        <View style={s.subtotalRow}>
          <Text style={s.subtotalLabel}>Delivery Fee</Text>
          <Text style={s.subtotalValue}>{fmt(deliveryFee)}</Text>
        </View>
      )}
      <View style={s.totalBox}>
        <Text style={s.totalLabel}>TOTAL AMOUNT</Text>
        <Text style={s.totalAmount}>{fmt(totalAmount)}</Text>
      </View>
    </View>
  )
}

function SignatureBlock({ cols }: { cols: { name?: string; label: string }[] }) {
  return (
    <View style={s.signWrapper}>
      <View style={s.signRow}>
        {cols.map((c, i) => (
          <View key={i} style={s.signCol}>
            <Text style={s.signName}>{c.name ?? ''}</Text>
            <View style={s.signLine} />
            <Text style={s.signLabel}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function PageFooter({ left, right }: { left: string; right: string }) {
  return (
    <View style={s.footerWrapper}>
      <Text style={s.footerText}>{left}</Text>
      <Text style={s.footerText}>{right}</Text>
    </View>
  )
}

// ─── Invoice PDF ──────────────────────────────────────────────────────────────

function InvoicePdf({ inv, businessName = '' }: { inv: InvoiceDoc; businessName?: string }) {
  const details = inv.details ?? []
  const linesTotal = details.reduce((sum, d) => sum + Number(d.total), 0)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brandName}>Zolvix</Text>
            {businessName ? <Text style={s.brandSub}>{businessName}</Text> : null}
          </View>
          <View style={s.docRight}>
            <Text style={s.docType}>INVOICE</Text>
            <Text style={s.docNumber}>{inv.invoiceNumber}</Text>
            <Text style={s.docMeta}>
              {fmtDate(inv.createdAt)}{inv.status ? ` · ${capitalize(inv.status)}` : ''}
            </Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Info panels */}
        <View style={s.infoRow}>
          <InfoBox side="left" title="BILL TO">
            <Text style={s.infoName}>{inv.customer?.name ?? 'Walk-in Customer'}</Text>
            {inv.customer?.address ? <Text style={s.infoLine}>{inv.customer.address}</Text> : null}
            {inv.customer?.phone ? <Text style={s.infoLine}>Tel: {inv.customer.phone}</Text> : null}
            {inv.customer?.email ? <Text style={s.infoLine}>{inv.customer.email}</Text> : null}
          </InfoBox>
          <InfoBox side="right" title="INVOICE DETAILS">
            <Text style={s.infoName}>{inv.invoiceNumber}</Text>
            <Text style={s.infoLine}>Date: {fmtDate(inv.createdAt)}</Text>
            {inv.status ? <Text style={s.infoLine}>Status: {capitalize(inv.status)}</Text> : null}
            {inv.soNumber ? <Text style={s.infoLine}>SO: {inv.soNumber}</Text> : null}
          </InfoBox>
        </View>

        {/* Items */}
        <ItemsTable
          details={details}
          columns={{ qty: 'QTY', price: 'UNIT PRICE', amount: 'AMOUNT' }}
        />

        {/* Totals */}
        <TotalsBlock
          linesTotal={linesTotal}
          discount={Number(inv.discount ?? 0)}
          discountMode={inv.discountMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'}
          deliveryFee={Number(inv.deliveryFee ?? 0)}
          totalAmount={inv.totalAmount}
        />

        {/* Signature */}
        <SignatureBlock cols={[
          { label: 'PREPARED BY' },
          { label: 'CHECKED BY' },
          { label: 'RECEIVED BY' },
        ]} />

        {/* Footer */}
        <PageFooter
          left={`Zolvix · Invoice`}
          right={`${inv.invoiceNumber} · Generated ${generatedOn()}`}
        />
      </Page>
    </Document>
  )
}

// ─── Sales Order PDF ──────────────────────────────────────────────────────────

function SOPdf({ so, businessName = '' }: { so: SODoc; businessName?: string }) {
  const details = so.details ?? []
  const linesTotal = details.reduce((sum, d) => sum + Number(d.total), 0)
  const orderDate = so.orderDate ?? so.createdAt

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brandName}>Zolvix</Text>
            {businessName ? <Text style={s.brandSub}>{businessName}</Text> : null}
          </View>
          <View style={s.docRight}>
            <Text style={s.docType}>SALES ORDER</Text>
            <Text style={s.docNumber}>{so.soNumber}</Text>
            <Text style={s.docMeta}>
              {fmtDate(orderDate)}{so.status ? ` · ${capitalize(so.status)}` : ''}
            </Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Info panels */}
        <View style={s.infoRow}>
          <InfoBox side="left" title="CUSTOMER">
            <Text style={s.infoName}>{so.customer?.name ?? '—'}</Text>
            {so.customer?.address ? <Text style={s.infoLine}>{so.customer.address}</Text> : null}
            {so.customer?.phone ? <Text style={s.infoLine}>Tel: {so.customer.phone}</Text> : null}
            {so.customer?.email ? <Text style={s.infoLine}>{so.customer.email}</Text> : null}
          </InfoBox>
          <InfoBox side="right" title="ORDER DETAILS">
            <Text style={s.infoName}>{so.soNumber}</Text>
            <Text style={s.infoLine}>Date: {fmtDate(orderDate)}</Text>
            {so.status ? <Text style={s.infoLine}>Status: {capitalize(so.status)}</Text> : null}
            {so.employee?.name ? <Text style={s.infoLine}>Sales Agent: {so.employee.name}</Text> : null}
            {so.approvedBy?.name ? <Text style={s.infoLine}>Approved by: {so.approvedBy.name}</Text> : null}
          </InfoBox>
        </View>

        {/* Items */}
        <ItemsTable
          details={details}
          columns={{ qty: 'QTY', price: 'UNIT PRICE', amount: 'AMOUNT' }}
        />

        {/* Totals */}
        <TotalsBlock
          linesTotal={linesTotal}
          discount={Number(so.discount ?? 0)}
          discountMode={so.discountMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'}
          deliveryFee={Number(so.deliveryFee ?? 0)}
          totalAmount={so.totalAmount}
        />

        {/* Signature */}
        <SignatureBlock cols={[
          { name: so.employee?.name, label: 'PREPARED BY' },
          { name: so.approvedBy?.name, label: 'APPROVED BY' },
          { label: 'RECEIVED BY' },
        ]} />

        {/* Footer */}
        <PageFooter
          left={`Zolvix · Sales Order`}
          right={`${so.soNumber} · Generated ${generatedOn()}`}
        />
      </Page>
    </Document>
  )
}

// ─── Exports ──────────────────────────────────────────────────────────────────

function openPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export async function printInvoicePdf(inv: InvoiceDoc, businessName?: string): Promise<void> {
  try {
    await ensureFonts()
    const blob = await pdf(<InvoicePdf inv={inv} businessName={businessName} />).toBlob()
    openPdfBlob(blob, `${inv.invoiceNumber}.pdf`)
  } catch (err) {
    console.error('Failed to generate invoice PDF:', err)
    throw new Error('Could not generate PDF. See console for details.')
  }
}

export async function printSOPdf(so: SODoc, businessName?: string): Promise<void> {
  try {
    await ensureFonts()
    const blob = await pdf(<SOPdf so={so} businessName={businessName} />).toBlob()
    openPdfBlob(blob, `${so.soNumber}.pdf`)
  } catch (err) {
    console.error('Failed to generate SO PDF:', err)
    throw new Error('Could not generate PDF. See console for details.')
  }
}
