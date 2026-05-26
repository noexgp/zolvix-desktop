import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer, FileText } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { printInvoicePdf } from '@/lib/print-pdf'
import { printLx310 } from '@/lib/escp'

interface InvoiceDetail {
  id: string
  productId: string
  quantity: number
  unitPrice: number | string
  total: number | string
  product?: { name: string }
}

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  totalAmount: number | string
  createdAt: string
  customer?: { name: string }
  details?: InvoiceDetail[]
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [printError, setPrintError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch(`/api/invoice/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load invoice')
        return r.json()
      })
      .then(d => setInvoice(d.invoice ?? (d.id ? d : null)))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load invoice'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Loading...</div>
  if (error) return <div className="p-8 text-red-400 text-sm">{error}</div>
  if (!invoice) return (
    <div className="p-8 space-y-2">
      <div className="text-muted-foreground text-sm">Invoice not found.</div>
      <button onClick={() => navigate('/invoices')} className="text-primary text-xs underline">← Back to Invoices</button>
    </div>
  )

  const { invoiceNumber, customer, details, totalAmount, status } = invoice

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <h1 className="text-foreground font-bold text-lg">{invoiceNumber}</h1>
        <span className="text-xs px-2 py-0.5 rounded bg-primary/15 text-primary capitalize">{status}</span>
      </div>

      <div className="text-muted-foreground text-sm">{customer?.name ?? 'Walk-in'}</div>

      <div className="bg-card rounded-lg p-3 space-y-1">
        {(details ?? []).map(d => (
          <div key={d.id} className="flex justify-between text-xs">
            <span className="text-foreground">{d.product?.name} × {d.quantity}</span>
            <span className="text-foreground">₱{Number(d.total).toLocaleString()}</span>
          </div>
        ))}
        <div className="border-t border-border pt-2 text-right text-xs font-bold text-foreground">
          Total: ₱{Number(totalAmount).toLocaleString()}
        </div>
      </div>

      {/* 3 print buttons */}
      <div className="space-y-2">
        <div className="text-muted-foreground text-xs font-medium">Print Invoice</div>
        {printError && <p className="text-red-400 text-xs">{printError}</p>}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => printLx310(invoice, 'preprinted').catch(e => setPrintError(e instanceof Error ? e.message : 'Print failed'))}>
            <Printer className="w-3.5 h-3.5" /> Pre-printed Form
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => printLx310(invoice, 'plain').catch(e => setPrintError(e instanceof Error ? e.message : 'Print failed'))}>
            <Printer className="w-3.5 h-3.5" /> Plain LX-310
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => printInvoicePdf(invoice).catch(e => setPrintError(e instanceof Error ? e.message : 'Print failed'))}>
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
        </div>
      </div>
    </div>
  )
}
