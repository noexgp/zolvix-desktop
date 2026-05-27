import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { db, isCacheExpired, setCacheMeta } from '@/lib/db'
import type { CachedCustomer } from '@/lib/db'
import SearchableSelect from '@/components/SearchableSelect'
import StatusBadge from '@/components/StatusBadge'
import Pagination from '@/components/Pagination'
import ErrorBanner from '@/components/ErrorBanner'
import EmptyState from '@/components/EmptyState'

interface Invoice {
  id: string
  invoiceNumber: string
  totalAmount: number
  balance: number
  status: string
  void: boolean
  createdAt: string
  customer?: { name: string } | null
  employee?: { name: string } | null
  soNumber?: string | null
}

interface Employee { id: string; name: string }

const PAGE_SIZE = 20

interface Filters { from: string; to: string; customerId: string; employeeId: string }

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [filters, setFilters] = useState<Filters>({ from: '', to: '', customerId: '', employeeId: '' })
  const [draft, setDraft] = useState<Filters>({ from: '', to: '', customerId: '', employeeId: '' })

  const [customers, setCustomers] = useState<CachedCustomer[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  const [syncKey, setSyncKey] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    async function loadRefData() {
      // Customers — use cache if fresh, otherwise fetch and repopulate
      const cExpired = await isCacheExpired('customers', 5 * 60 * 1000)
      const cached = !cExpired ? await db.customers.toArray() : []
      if (cached.length > 0) {
        setCustomers(cached)
      } else {
        const res = await apiFetch('/api/customer?limit=500')
        if (res.ok) {
          const data = await res.json()
          const items: CachedCustomer[] = (Array.isArray(data) ? data : (data.customers ?? data.data ?? [])).map((c: any) => ({
            id: c.id, name: c.name, phone: c.phone ?? undefined, email: c.email ?? undefined,
            address: c.address ?? undefined, terms: c.terms ?? undefined,
            isActive: c.isActive, updatedAt: c.updatedAt,
          }))
          await db.customers.clear()
          await db.customers.bulkPut(items)
          await setCacheMeta('customers')
          setCustomers(items)
        }
      }

      // Employees — always fetch fresh (not cached in Dexie)
      const eRes = await apiFetch('/api/employees?limit=200')
      if (eRes.ok) {
        const eData = await eRes.json()
        const emps: Employee[] = Array.isArray(eData) ? eData : (eData.data ?? [])
        setEmployees(emps.map(e => ({ id: e.id, name: e.name })))
      }
    }
    loadRefData().catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    async function doFetch() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
        if (filters.from) params.set('from', filters.from)
        if (filters.to) params.set('to', filters.to)
        if (filters.customerId) params.set('customerId', filters.customerId)
        if (filters.employeeId) params.set('employeeId', filters.employeeId)

        const res = await apiFetch(`/api/invoice?${params}`)
        if (cancelled) return
        if (!res.ok) throw new Error('Failed to load invoices')
        const d = await res.json()
        if (cancelled) return
        setInvoices(Array.isArray(d) ? d : (d.invoices ?? []))
        setTotalPages(d.totalPages ?? 1)
        setTotal(d.total ?? 0)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load invoices')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    doFetch()
    return () => { cancelled = true }
  }, [page, filters, syncKey])

  function applyFilters() {
    setFilters({ ...draft })
    setPage(1)
  }

  function clearFilters() {
    const empty: Filters = { from: '', to: '', customerId: '', employeeId: '' }
    setDraft(empty)
    setFilters(empty)
    setPage(1)
  }

  const hasActiveFilters = filters.from || filters.to || filters.customerId || filters.employeeId
  const hasDraftChange =
    draft.from !== filters.from || draft.to !== filters.to ||
    draft.customerId !== filters.customerId || draft.employeeId !== filters.employeeId

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background">
        <span className="text-foreground font-semibold text-sm">Invoices</span>
        <div className="ml-auto flex items-center gap-2">
          {total > 0 && (
            <span className="text-[11px] text-muted-foreground">{total.toLocaleString()} invoice{total !== 1 ? 's' : ''}</span>
          )}
          <Button size="sm" variant="outline" onClick={() => setSyncKey(k => k + 1)} className="gap-1">
            <RefreshCw className="w-3 h-3" /> Sync
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2 px-4 py-2 border-b border-border">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">From</span>
          <Input type="date" value={draft.from}
            onChange={e => setDraft(d => ({ ...d, from: e.target.value }))}
            className="h-7 text-xs text-foreground w-34" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">To</span>
          <Input type="date" value={draft.to}
            onChange={e => setDraft(d => ({ ...d, to: e.target.value }))}
            className="h-7 text-xs text-foreground w-34" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Customer</span>
          <SearchableSelect
            value={draft.customerId}
            onChange={(id) => setDraft(d => ({ ...d, customerId: id }))}
            items={[{ id: '', label: 'All customers' }, ...customers.map(c => ({ id: c.id, label: c.name }))]}
            placeholder="All customers"
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Agent</span>
          <SearchableSelect
            value={draft.employeeId}
            onChange={(id) => setDraft(d => ({ ...d, employeeId: id }))}
            items={[{ id: '', label: 'All agents' }, ...employees.map(e => ({ id: e.id, label: e.name }))]}
            placeholder="All agents"
            className="w-36"
          />
        </div>
        <Button size="sm" onClick={applyFilters} disabled={!hasDraftChange && !hasActiveFilters}>
          Search
        </Button>
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
            Clear
          </Button>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-12 gap-1 px-4 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wide border-b border-border bg-background/40">
        <span className="col-span-2">Invoice #</span>
        <span className="col-span-3">Customer</span>
        <span className="col-span-2">Agent</span>
        <span className="col-span-2">Date</span>
        <span className="col-span-1 text-right">Amount</span>
        <span className="col-span-1 text-right">Balance</span>
        <span className="col-span-1 text-center">Status</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-4 text-xs text-muted-foreground">Loading...</div>}
        {error && <ErrorBanner message={error} className="mx-4 mt-3" />}
        {!loading && invoices.map(inv => (
          <div
            key={inv.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/invoices/${inv.id}`)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/invoices/${inv.id}`) } }}
            className={cn(
              'grid grid-cols-12 gap-1 items-center px-4 py-2 cursor-pointer border-b border-border/50 hover:bg-muted/50 focus:outline-none focus:bg-muted/50',
              inv.void && 'opacity-40'
            )}
          >
            <span className="col-span-2 text-xs font-mono text-foreground truncate">{inv.invoiceNumber}</span>
            <span className="col-span-3 text-xs text-foreground truncate">{inv.customer?.name ?? 'Walk-in'}</span>
            <span className="col-span-2 text-xs text-muted-foreground truncate">{inv.employee?.name ?? '—'}</span>
            <span className="col-span-2 text-[11px] text-muted-foreground">
              {new Date(inv.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' })}
            </span>
            <span className="col-span-1 text-xs text-right text-foreground tabular-nums">
              ₱{Number(inv.totalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
            <span className={cn('col-span-1 text-xs text-right tabular-nums',
              Number(inv.balance) <= 0 ? 'text-muted-foreground' : 'text-amber-400'
            )}>
              {Number(inv.balance) <= 0 ? '—' : `₱${Number(inv.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
            </span>
            <span className="col-span-1 flex justify-center">
              <StatusBadge status={inv.status} voided={inv.void} />
            </span>
          </div>
        ))}
        {!loading && !error && invoices.length === 0 && <EmptyState message="No invoices found." />}
      </div>

      <Pagination page={page} totalPages={totalPages} loading={loading} onPageChange={setPage} />
    </div>
  )
}
