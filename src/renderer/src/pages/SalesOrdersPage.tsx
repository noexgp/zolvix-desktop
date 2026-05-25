import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import SOListItem from '@/components/SOListItem'
import PipelineStepper from '@/components/PipelineStepper'
import DeliveryReceiptForm from '@/components/DeliveryReceiptForm'
import { apiFetch } from '@/lib/api'
import { db, isCacheExpired, setCacheMeta, invalidateCache } from '@/lib/db'
import { useAppStore } from '@/stores/appStore'

const TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'partially_delivered', label: 'Part. Del.' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'invoiced', label: 'Invoiced' },
]

const SO_TTL = 60 * 1000

export default function SalesOrdersPage() {
  const [soList, setSoList] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSO, setSelectedSO] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState('')
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drOpen, setDrOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const { businessSettings } = useAppStore()
  const navigate = useNavigate()

  const fetchList = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    try {
      const expired = await isCacheExpired('salesOrders', SO_TTL)
      if (!expired && !forceRefresh) {
        const cached = await db.salesOrders.toArray()
        setSoList(cached)
        return
      }
      const res = await apiFetch('/api/sales-orders?limit=100')
      if (res.ok) {
        const data = await res.json()
        const items = data.salesOrders ?? []
        await db.salesOrders.clear()
        await db.salesOrders.bulkPut(items.map((s: any) => ({
          id: s.id,
          soNumber: s.soNumber,
          status: s.status,
          totalAmount: Number(s.totalAmount),
          customerName: s.customer?.name,
          customerId: s.customerId,
          orderDate: s.orderDate ?? s.createdAt,
          updatedAt: s.updatedAt,
        })))
        await setCacheMeta('salesOrders')
        setSoList(items.map((s: any) => ({
          id: s.id,
          soNumber: s.soNumber,
          status: s.status,
          totalAmount: Number(s.totalAmount),
          customerName: s.customer?.name,
          customerId: s.customerId,
          orderDate: s.orderDate ?? s.createdAt,
          updatedAt: s.updatedAt,
        })))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  async function fetchDetail(id: string) {
    setDetailLoading(true)
    try {
      const res = await apiFetch(`/api/sales-orders/${id}`)
      if (res.ok) setSelectedSO(await res.json())
    } finally {
      setDetailLoading(false)
    }
  }

  function handleSelect(id: string) {
    setSelectedId(id)
    fetchDetail(id)
  }

  async function handleAction(action: string) {
    if (!selectedSO) return
    setActionError('')
    const so = selectedSO?.salesOrder ?? selectedSO
    const id = so.id
    const endpoints: Record<string, string> = {
      submit:  `/api/sales-orders/${id}/submit`,
      approve: `/api/sales-orders/${id}/approve`,
      reject:  `/api/sales-orders/${id}/reject`,
      invoice: `/api/sales-orders/${id}/invoice`,
      delete:  `/api/sales-orders/${id}`,
      reopen:  `/api/sales-orders/${id}/reopen`,
    }
    const url = endpoints[action]
    if (!url) return
    const method = action === 'delete' ? 'DELETE' : 'POST'
    const res = await apiFetch(url, {
      method,
      body: method !== 'DELETE' ? JSON.stringify({}) : undefined,
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setActionError(e.error ?? `Failed to ${action}`)
      return
    }
    await invalidateCache('salesOrders')
    if (action === 'delete') {
      setSelectedId(null)
      setSelectedSO(null)
    }
    await fetchList(true)
    if (action !== 'delete') fetchDetail(id)
  }

  const filtered = activeTab ? soList.filter(s => s.status === activeTab) : soList
  const soDetail = selectedSO?.salesOrder ?? selectedSO

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900">
        <span className="text-white font-semibold text-sm">Sales Orders</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fetchList(true)} className="gap-1 text-xs h-7">
            <RefreshCw className="w-3 h-3" /> Sync
          </Button>
          <Button size="sm" onClick={() => navigate('/sales-orders/new')} className="gap-1 text-xs h-7">
            <Plus className="w-3 h-3" /> New SO
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-slate-800 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap ${
              activeTab === t.key ? 'bg-blue-900 text-blue-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* SO List */}
        <div className="w-64 border-r border-slate-800 overflow-y-auto shrink-0">
          {loading && <div className="p-4 text-xs text-slate-500">Loading...</div>}
          {filtered.map(s => (
            <SOListItem
              key={s.id}
              so={s}
              selected={selectedId === s.id}
              onClick={() => handleSelect(s.id)}
            />
          ))}
          {!loading && filtered.length === 0 && (
            <div className="p-4 text-xs text-slate-500">No sales orders found.</div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto p-4">
          {detailLoading && <div className="text-xs text-slate-500">Loading...</div>}
          {!detailLoading && soDetail && (
            <>
              {actionError && (
                <div className="mb-3 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
                  {actionError}
                </div>
              )}
              <SODetail
                so={soDetail}
                businessSettings={businessSettings}
                onAction={handleAction}
                onRefresh={() => fetchDetail(soDetail.id)}
                drOpen={drOpen}
                setDrOpen={setDrOpen}
              />
            </>
          )}
          {!detailLoading && !soDetail && (
            <div className="flex items-center justify-center h-full text-slate-600 text-sm">
              Select a sales order to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SODetailProps {
  so: any
  businessSettings: any
  onAction: (a: string) => void
  onRefresh: () => void
  drOpen: boolean
  setDrOpen: (v: boolean) => void
}

function SODetail({ so, businessSettings, onAction, onRefresh, drOpen, setDrOpen }: SODetailProps) {
  const { id, soNumber, status, customer, details, totalAmount } = so

  const actionMap: Record<string, { label: string; variant: string; action: string }[]> = {
    draft:               [{ label: 'Submit', variant: 'default', action: 'submit' }, { label: 'Delete', variant: 'destructive', action: 'delete' }],
    pending_approval:    [{ label: 'Approve', variant: 'default', action: 'approve' }, { label: 'Reject', variant: 'destructive', action: 'reject' }],
    approved:            [{ label: 'Record Delivery', variant: 'default', action: 'dr' }],
    partially_delivered: [{ label: 'Record Delivery', variant: 'default', action: 'dr' }],
    delivered:           [{ label: 'Convert to Invoice', variant: 'default', action: 'invoice' }],
    invoiced:            [],
    rejected:            [{ label: 'Reopen as Draft', variant: 'outline', action: 'reopen' }],
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-white text-lg font-bold">{soNumber}</div>
          <div className="text-slate-400 text-xs">{customer?.name} · {new Date(so.orderDate ?? so.createdAt).toLocaleDateString('en-PH')}</div>
        </div>
        <span className={cn(
          'text-xs px-2 py-1 rounded font-medium capitalize',
          {
            'bg-slate-800 text-slate-400': status === 'draft',
            'bg-amber-900/30 text-amber-400': status === 'pending_approval',
            'bg-green-900/30 text-green-400': status === 'approved',
            'bg-blue-900/30 text-blue-400': status === 'partially_delivered',
            'bg-indigo-900/30 text-indigo-400': status === 'delivered',
            'bg-purple-900/30 text-purple-400': status === 'invoiced',
            'bg-red-900/30 text-red-400': status === 'rejected',
          }
        )}>
          {status?.replace(/_/g, ' ')}
        </span>
      </div>

      <PipelineStepper status={status} bypassApproval={businessSettings?.bypassApproval ?? false} />

      {/* Line items */}
      <div className="bg-slate-800 rounded-lg p-3">
        <div className="text-xs font-semibold text-white mb-2">Line Items</div>
        <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500 pb-1 border-b border-slate-700 mb-1">
          <span className="col-span-2">Product</span><span className="text-center">Qty</span><span className="text-right">Total</span>
        </div>
        {(details ?? []).map((d: any) => (
          <div key={d.id} className="grid grid-cols-4 gap-1 text-xs py-0.5">
            <span className="col-span-2 text-slate-300 truncate">{d.product?.name}</span>
            <span className="text-center text-slate-400">{d.quantity}</span>
            <span className="text-right text-white">₱{Number(d.total).toLocaleString()}</span>
          </div>
        ))}
        <div className="border-t border-slate-700 mt-2 pt-2 text-right text-xs font-bold text-white">
          Total: ₱{Number(totalAmount).toLocaleString()}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {(actionMap[status] ?? []).map(({ label, variant, action }) => (
          <Button
            key={action}
            size="sm"
            variant={variant as any}
            onClick={() => action === 'dr' ? setDrOpen(true) : onAction(action)}
            className="text-xs"
          >
            {label}
          </Button>
        ))}
        <Button size="sm" variant="outline" className="text-xs" onClick={() => {}}>
          Print PDF
        </Button>
      </div>

      {/* DR dialog — rendered here so it has access to details */}
      <DeliveryReceiptForm
        open={drOpen}
        onClose={() => setDrOpen(false)}
        soId={id}
        details={(details ?? []).map((d: any) => ({
          id: d.id,
          productId: d.productId,
          productName: d.product?.name ?? '',
          quantity: Number(d.quantity),
          deliveredQty: Number(d.deliveredQty ?? 0),
        }))}
        onSuccess={onRefresh}
      />
    </div>
  )
}
