import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@/lib/api'

interface Invoice {
  id: string
  invoiceNumber: string
  totalAmount: number | string
  status: string
  customer?: { name: string }
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/invoice?limit=100')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load invoices')
        return r.json()
      })
      .then(d => setInvoices(d.invoices ?? d))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load invoices'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-900">
        <span className="text-white font-semibold text-sm">Invoices</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-slate-500 text-xs">Loading...</div>}
        {error && <div className="text-red-400 text-xs bg-red-900/20 p-2 rounded mb-2">{error}</div>}
        <div className="space-y-1">
          {invoices.map(inv => (
            <div
              key={inv.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/invoices/${inv.id}`)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(`/invoices/${inv.id}`) }}
              className="flex items-center justify-between bg-slate-800 rounded px-3 py-2 cursor-pointer hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div>
                <div className="text-white text-xs font-medium">{inv.invoiceNumber}</div>
                <div className="text-slate-400 text-[11px]">{inv.customer?.name ?? 'Walk-in'}</div>
              </div>
              <div className="text-right">
                <div className="text-white text-xs">₱{Number(inv.totalAmount).toLocaleString()}</div>
                <div className="text-slate-500 text-[10px]">{inv.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
