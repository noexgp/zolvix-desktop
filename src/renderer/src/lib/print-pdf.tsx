// TODO: Register NotoSans font for ₱ peso sign rendering
// Font.register({ family: 'NotoSans', src: '/path/to/NotoSans-Regular.ttf' })
// Then change fontFamily: 'Helvetica' → 'NotoSans' throughout, and use ₱ instead of 'P'
// Currently using 'P' as placeholder because Helvetica lacks the ₱ glyph
import React from 'react'
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: 'Helvetica', fontSize: 9, color: '#1e293b' },
  header: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  subheader: { fontSize: 9, color: '#64748b', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  tableHeader: { flexDirection: 'row', borderBottom: '1pt solid #94a3b8', paddingBottom: 3, marginBottom: 4 },
  col1: { flex: 3 },
  col2: { flex: 1, textAlign: 'right' },
  col3: { flex: 1, textAlign: 'right' },
  col4: { flex: 1, textAlign: 'right' },
  total: { borderTop: '1pt solid #94a3b8', marginTop: 6, paddingTop: 4, flexDirection: 'row', justifyContent: 'flex-end', fontWeight: 'bold' },
})

interface DocDetail {
  id: string
  quantity: number
  unitPrice: number | string
  total: number | string
  product?: { name?: string }
}

interface InvoiceDoc {
  invoiceNumber: string
  totalAmount: number | string
  createdAt: string
  customer?: { name?: string }
  details?: DocDetail[]
}

interface SODoc {
  soNumber: string
  totalAmount: number | string
  orderDate?: string
  createdAt?: string
  customer?: { name?: string }
  details?: DocDetail[]
}

function InvoicePdf({ inv }: { inv: InvoiceDoc }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{inv.invoiceNumber}</Text>
        <Text style={styles.subheader}>
          Customer: {inv.customer?.name ?? 'Walk-in'} · {new Date(inv.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
        </Text>
        <View style={styles.tableHeader}>
          <Text style={styles.col1}>Product</Text>
          <Text style={styles.col2}>Qty</Text>
          <Text style={styles.col3}>Unit Price</Text>
          <Text style={styles.col4}>Total</Text>
        </View>
        {(inv.details ?? []).map(d => (
          <View key={d.id} style={styles.row}>
            <Text style={styles.col1}>{d.product?.name ?? ''}</Text>
            <Text style={styles.col2}>{d.quantity}</Text>
            <Text style={styles.col3}>P{Number(d.unitPrice).toLocaleString()}</Text>
            <Text style={styles.col4}>P{Number(d.total).toLocaleString()}</Text>
          </View>
        ))}
        <View style={styles.total}>
          <Text>Total: P{Number(inv.totalAmount).toLocaleString()}</Text>
        </View>
      </Page>
    </Document>
  )
}

function SOPdf({ so }: { so: SODoc }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{so.soNumber}</Text>
        <Text style={styles.subheader}>
          Customer: {so.customer?.name ?? '—'} · {(() => {
            const d = so.orderDate ?? so.createdAt
            return d ? new Date(d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : '—'
          })()}
        </Text>
        <View style={styles.tableHeader}>
          <Text style={styles.col1}>Product</Text>
          <Text style={styles.col2}>Qty</Text>
          <Text style={styles.col3}>Unit Price</Text>
          <Text style={styles.col4}>Total</Text>
        </View>
        {(so.details ?? []).map(d => (
          <View key={d.id} style={styles.row}>
            <Text style={styles.col1}>{d.product?.name ?? ''}</Text>
            <Text style={styles.col2}>{d.quantity}</Text>
            <Text style={styles.col3}>P{Number(d.unitPrice).toLocaleString()}</Text>
            <Text style={styles.col4}>P{Number(d.total).toLocaleString()}</Text>
          </View>
        ))}
        <View style={styles.total}>
          <Text>Total: P{Number(so.totalAmount).toLocaleString()}</Text>
        </View>
      </Page>
    </Document>
  )
}

function openPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  // Opens in a new Electron window using Chromium's built-in PDF viewer.
  // The viewer's print button gives full paper size / margin / orientation controls.
  const win = window.open(url, '_blank')
  if (!win) {
    // Fallback: download if popup was blocked
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export async function printInvoicePdf(inv: InvoiceDoc): Promise<void> {
  try {
    const blob = await pdf(<InvoicePdf inv={inv} />).toBlob()
    openPdfBlob(blob, `${inv.invoiceNumber}.pdf`)
  } catch (err) {
    console.error('Failed to generate invoice PDF:', err)
    throw new Error('Could not generate PDF. See console for details.')
  }
}

export async function printSOPdf(so: SODoc): Promise<void> {
  try {
    const blob = await pdf(<SOPdf so={so} />).toBlob()
    openPdfBlob(blob, `${so.soNumber}.pdf`)
  } catch (err) {
    console.error('Failed to generate SO PDF:', err)
    throw new Error('Could not generate PDF. See console for details.')
  }
}
