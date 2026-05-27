import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SOListItem from '@/components/SOListItem'
import DeliveryReceiptForm from '@/components/DeliveryReceiptForm'
import StatusBadge from '@/components/StatusBadge'
import ErrorBanner from '@/components/ErrorBanner'
import { apiFetch } from '@/lib/api'
import { db, isCacheExpired, setCacheMeta, invalidateCache } from '@/lib/db'
import { useAppStore } from '@/stores/appStore'
import { printSOPdf } from '@/lib/print-pdf'
import { getPendingCount, syncPendingSalesOrders } from '@/lib/sync'

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
  const { businessSettings, setBusinessSettings, currentUser } = useAppStore()
  const [bypassApproval, setBypassApproval] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const navigate = useNavigate()

  // Fetch business settings fresh on every visit
  useEffect(() => {
    apiFetch('/api/settings/business').then(r => r.ok ? r.json() : null).then(b => {
      if (!b) return
      const bypass = !(b.requireSoApproval ?? true)
      setBypassApproval(bypass)
      setBusinessSettings({ bypassApproval: bypass, name: b.name ?? '' })
    }).catch(() => {})
  }, [setBusinessSettings])

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
          userId: s.userId,
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
          userId: s.userId,
        })))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  useEffect(() => {
    getPendingCount().then(setPendingCount)
  }, [])

  async function handleSyncNow() {
    const result = await syncPendingSalesOrders()
    if (result.synced > 0) {
      await fetchList(true)
      getPendingCount().then(setPendingCount)
    }
  }

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

    // Invoice: prefer DR-based endpoint (no SO status restriction) using the latest confirmed DR
    if (action === 'invoice') {
      const confirmedDr = (so.deliveryReceipts ?? []).find(
        (dr: any) => dr.status === 'confirmed' && !dr.invoiceId
      )
      if (confirmedDr) {
        const res = await apiFetch(`/api/delivery-receipts/${confirmedDr.id}/invoice`, { method: 'POST' })
        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          setActionError(e.error ?? 'Failed to create invoice')
          return
        }
        await invalidateCache('salesOrders')
        await fetchList(true)
        fetchDetail(id)
        return
      }
      // Fallback: SO-based invoice (works when server allows 'delivered' status)
    }

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
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background">
        <span className="text-foreground font-semibold text-sm">Sales Orders</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fetchList(true)} className="gap-1 text-xs h-7">
            <RefreshCw className="w-3 h-3" /> Sync
          </Button>
          <Button size="sm" onClick={() => navigate('/sales-orders/new')} className="gap-1 text-xs h-7">
            <Plus className="w-3 h-3" /> New SO
          </Button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-700 dark:text-yellow-400">
          <span>{pendingCount} order{pendingCount > 1 ? 's' : ''} saved offline, pending sync</span>
          <button onClick={handleSyncNow} className="ml-auto underline hover:no-underline">Sync now</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-border overflow-x-auto">
        {TABS.map(t => {
          const count = t.key === '' ? soList.length : soList.filter(s => s.status === t.key).length
          return (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap ${
              activeTab === t.key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {count > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                activeTab === t.key ? 'bg-primary/30 text-primary' : 'bg-muted text-foreground'
              }`}>{count}</span>
            )}
          </button>
          )
        })}
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* SO List */}
        <div className="w-64 border-r border-border overflow-y-auto shrink-0">
          {loading && <div className="p-4 text-xs text-muted-foreground">Loading...</div>}
          {filtered.map(s => (
            <SOListItem
              key={s.id}
              so={s}
              selected={selectedId === s.id}
              onClick={() => handleSelect(s.id)}
            />
          ))}
          {!loading && filtered.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">No sales orders found.</div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto p-4">
          {detailLoading && <div className="text-xs text-muted-foreground">Loading...</div>}
          {!detailLoading && soDetail && (
            <>
              {actionError && <ErrorBanner message={actionError} className="mb-3" />}
              <SODetail
                so={soDetail}
                businessSettings={{ ...(businessSettings ?? { name: '' }), bypassApproval }}
                currentUser={currentUser}
                onAction={handleAction}
                onRefresh={() => fetchDetail(soDetail.id)}
                drOpen={drOpen}
                setDrOpen={setDrOpen}
                setActionError={setActionError}
              />
            </>
          )}
          {!detailLoading && !soDetail && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
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
  currentUser: any
  onAction: (a: string) => void
  onRefresh: () => void
  drOpen: boolean
  setDrOpen: (v: boolean) => void
  setActionError: (msg: string) => void
}

function SODetail({ so, businessSettings, currentUser, onAction, onRefresh, drOpen, setDrOpen, setActionError }: SODetailProps) {
  const { id, soNumber, status, customer, details, totalAmount } = so
  const navigate = useNavigate()

  const actionMap: Record<string, { label: string; variant: string; action: string }[]> = {
    draft:               [{ label: 'Submit', variant: 'default', action: 'submit' }, { label: 'Delete', variant: 'destructive', action: 'delete' }],
    pending_approval:    [{ label: 'Approve', variant: 'default', action: 'approve' }, { label: 'Reject', variant: 'destructive', action: 'reject' }],
    approved:            [{ label: 'Record Delivery', variant: 'default', action: 'dr' }, ...(businessSettings?.bypassApproval ? [{ label: 'Reopen as Draft', variant: 'outline', action: 'reopen' }] : [])],
    partially_delivered: [{ label: 'Record Delivery', variant: 'default', action: 'dr' }],
    delivered:           [{ label: 'Convert to Invoice', variant: 'default', action: 'invoice' }],
    invoiced:            [],
    rejected:            [{ label: 'Reopen as Draft', variant: 'outline', action: 'reopen' }],
  }

  const linesTotal = (details ?? []).reduce((s: number, d: any) => s + Number(d.total), 0)
  const disc = Number(so.discount ?? 0)
  const fee = Number(so.deliveryFee ?? 0)
  const discMode = so.discountMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'
  const discAmt = discMode === 'AMOUNT' ? disc : linesTotal * (disc / 100)

  const formatDate = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  const totalDelivered = (so.deliveryReceipts ?? []).reduce((s: number, dr: any) => s + Number(dr.totalAmount ?? 0), 0)

  const canEdit = (status === 'draft' || (status === 'approved' && (businessSettings?.bypassApproval ?? false))) &&
    (!so.userId || so.userId === currentUser?.id)

  const actions = actionMap[status] ?? []

  return (
    <div className="space-y-3 pb-6">

      {/* ── Header ── */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xl font-bold text-foreground">{soNumber}</div>
            <div className="mt-1.5">
              <StatusBadge status={status} />
            </div>
          </div>
          {/* Action buttons compact */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {canEdit && (
              <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={() => navigate(`/sales-orders/${id}/edit`)}>
                <Pencil className="w-3 h-3" /> Edit
              </Button>
            )}
            {actions.map(({ label, variant, action }) => (
              <Button key={action} size="sm" variant={variant as any}
                className="text-xs h-7"
                onClick={() => action === 'dr' ? setDrOpen(true) : onAction(action)}>
                {label}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="text-xs h-7"
              onClick={() => { printSOPdf(so).catch(e => setActionError(e instanceof Error ? e.message : 'PDF failed')) }}>
              PDF
            </Button>
            <button onClick={onRefresh} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Order Info ── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">Order Info</span>
        </div>
        {[
          ['Customer',      customer?.name ?? '—'],
          ['Sales Agent',   so.employee?.name ?? '—'],
          ['Order Date',    formatDate(so.orderDate ?? so.createdAt)],
          ['Delivery Date', formatDate(so.deliveryDate)],
          ['Approved By',   so.approvedBy?.name ?? '—'],
        ].map(([label, value]) => (
          <div key={label as string} className="flex justify-between items-center px-4 py-2.5 border-b border-border last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold text-foreground text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Items ── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
            Items ({(details ?? []).length})
          </span>
        </div>
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_48px_80px_72px] px-4 py-2 border-b border-border">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Product</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Qty</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Unit Price</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Total</span>
        </div>
        {/* Line items */}
        {(details ?? []).map((d: any, i: number) => (
          <div key={d.id ?? i} className="grid grid-cols-[1fr_48px_80px_72px] px-4 py-2.5 border-b border-border">
            <div>
              <div className="text-sm font-semibold text-foreground leading-tight">{d.product?.name ?? '—'}</div>
              {d.product?.sku && <div className="text-xs text-muted-foreground mt-0.5">{d.product.sku}</div>}
            </div>
            <span className="text-sm text-muted-foreground text-right self-center">{d.quantity}</span>
            <span className="text-sm text-muted-foreground text-right self-center">₱{Number(d.unitPrice ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            <span className="text-sm font-bold text-foreground text-right self-center">₱{Number(d.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
        {/* Totals */}
        <div className="px-4 py-3 space-y-1.5">
          {disc > 0 && <>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>₱{linesTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm text-destructive">
              <span>Discount{discMode === 'PERCENT' ? ` (${disc}%)` : ''}</span>
              <span>-₱{discAmt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </>}
          {fee > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Delivery Fee</span>
              <span>₱{fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {disc > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground border-t border-border pt-1.5">
              <span>Subtotal</span>
              <span>₱{linesTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-border pt-1.5">
            <span className="text-sm font-bold text-foreground">Grand Total</span>
            <span className="text-base font-bold text-primary">₱{Number(totalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* ── Delivery Receipts ── */}
      {(so.deliveryReceipts ?? []).length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
              Delivery Receipts ({(so.deliveryReceipts ?? []).length})
            </span>
          </div>
          <div className="divide-y divide-border">
            {(so.deliveryReceipts ?? []).map((dr: any) => (
              <div key={dr.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dr.status === 'confirmed' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{dr.drNumber}</div>
                  <div className="text-xs text-muted-foreground">
                    {dr.warehouse?.name ?? 'Default warehouse'}
                    {dr.invoice?.invoiceNumber && (
                      <span className="text-primary ml-1">{dr.invoice.invoiceNumber}</span>
                    )}
                  </div>
                </div>
                <StatusBadge status={dr.status} className="text-[10px]" />
                <span className="text-sm font-semibold text-foreground shrink-0">
                  ₱{Number(dr.totalAmount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>
          <div className="flex justify-between px-4 py-2.5 border-t border-border text-sm">
            <span className="text-muted-foreground">Total delivered</span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              ₱{totalDelivered.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* ── Invoices ── */}
      {(so.invoices ?? []).length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
              Invoices ({(so.invoices ?? []).length})
            </span>
          </div>
          <div className="divide-y divide-border">
            {(so.invoices ?? []).map((inv: any) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${inv.void ? 'bg-muted-foreground' : inv.status === 'paid' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{inv.invoiceNumber}</div>
                  {Number(inv.balance ?? 0) > 0 && (
                    <div className="text-xs text-primary">Balance: ₱{Number(inv.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground capitalize shrink-0">{inv.void ? 'Void' : inv.status}</span>
                <span className="text-sm font-semibold text-foreground shrink-0">
                  ₱{Number(inv.totalAmount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
                <button
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  title="View invoice"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DR dialog ── */}
      <DeliveryReceiptForm
        open={drOpen}
        onClose={() => setDrOpen(false)}
        soId={id}
        details={(details ?? []).map((d: any) => ({
          id: d.id,
          productId: d.productId,
          productName: d.product?.name ?? '',
          quantity: Number(d.quantity),
          unitPrice: Number(d.unitPrice ?? 0),
          deliveredQty: Number(d.deliveredQty ?? 0),
        }))}
        onSuccess={onRefresh}
      />
    </div>
  )
}
