import { Fragment, useCallback, useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, CreditCard, TrendingDown, TrendingUp } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { db, isCacheExpired, setCacheMeta } from '@/lib/db'

// ── Types ────────────────────────────────────────────────────────────────────
interface Customer { id: string; name: string; phone?: string; email?: string; isActive: boolean }

interface LineItem {
  id: string; productName: string; quantity: number; unitPrice: number
  discount: number; discountType: string | null; total: number
}
interface SOAPayment {
  amount: number; method: string; paymentDate: string
  checkNumber?: string | null; referenceNo?: string | null; bankName?: string | null
  cardType?: string | null; approvalCode?: string | null; ewalletType?: string | null
  checkDate?: string | null; depositStatus?: string | null
}
interface SOACreditNote { amount: number; createdAt: string; creditNoteNumber: string }
interface SOAInvoice {
  id: string; invoiceNumber: string; createdAt: string; dueDate: string; status: string
  totalAmount: number; balance: number; withholdingTax: number; ewtMode?: string | null
  discountPct: number; discountMode: 'PERCENT' | 'AMOUNT'; deliveryFee: number; vatAmount: number
  lineItems: LineItem[]; payments: SOAPayment[]; creditNotes: SOACreditNote[]
}
type RowColor = 'red' | 'green' | 'orange' | 'purple' | null
interface LedgerEntry {
  date: Date; reference: string; description: string; debit: number; credit: number; balance: number
  invoiceId: string | null; lineItems: LineItem[]
  discountPct: number; discountMode: 'PERCENT' | 'AMOUNT'; deliveryFee: number; vatAmount: number; withholdingTax: number
  rowColor: RowColor; markPaid: boolean; markFull: boolean; markPartial: boolean; markDeposited: boolean
  checkAlert: 'overdue' | 'due_soon' | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string | Date) => {
  const dt = new Date(d)
  return `${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}/${dt.getFullYear()}`
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function monthStart(d: Date) { return ymd(new Date(d.getFullYear(), d.getMonth(), 1)) }
function monthEnd(d: Date) { return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }

const COLOR_MAP: Record<string, string> = {
  red:    'bg-red-700 text-white [&_td]:text-white [&_span]:text-white',
  green:  'bg-lime-600 text-gray-900 [&_td]:text-gray-900',
  orange: 'bg-orange-600 text-white [&_td]:text-white',
  purple: 'bg-violet-500 text-white [&_td]:text-white',
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [invoices, setInvoices] = useState<SOAInvoice[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingLedger, setLoadingLedger] = useState(false)
  const [includeHistory, setIncludeHistory] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const now = new Date()
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    return ymd(d)
  })
  const [toDate, setToDate] = useState(() => monthEnd(now))

  // Load customers from cache or API
  useEffect(() => {
    setLoadingCustomers(true)
    async function load() {
      const expired = await isCacheExpired('customers', 5 * 60 * 1000)
      const cached = !expired ? await db.customers.toArray() : []
      if (cached.length > 0) {
        setCustomers(cached as Customer[])
        return
      }
      const res = await apiFetch('/api/customer?limit=500')
      if (!res.ok) return
      const data = await res.json()
      const items: Customer[] = (Array.isArray(data) ? data : (data.data ?? [])).map((c: any) => ({
        id: c.id, name: c.name, phone: c.phone, email: c.email, isActive: c.isActive,
      }))
      await db.customers.clear()
      await db.customers.bulkPut(items.map((c: any) => ({
        id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '',
        isActive: c.isActive, updatedAt: new Date().toISOString(),
      })))
      await setCacheMeta('customers')
      setCustomers(items)
    }
    load().finally(() => setLoadingCustomers(false))
  }, [])

  // Fetch ledger when customer or dates change
  useEffect(() => {
    if (!selectedCustomer) return
    setLoadingLedger(true)
    setExpandedIds(new Set())
    apiFetch(`/api/invoice/customer/${selectedCustomer.id}?startDate=${fromDate}&endDate=${toDate}`)
      .then(r => r.json())
      .then(d => setInvoices(d.invoices ?? []))
      .catch(() => setInvoices([]))
      .finally(() => setLoadingLedger(false))
  }, [selectedCustomer, fromDate, toDate])

  const paymentLabel = useCallback((p: SOAPayment): string => {
    if (p.method === 'check') {
      let r = 'Check'
      if (p.checkNumber || p.referenceNo) r += ` #${p.checkNumber || p.referenceNo}`
      if (p.bankName) r += ` — ${p.bankName}`
      return r
    }
    if (p.method === 'card') return `Card${p.cardType ? ` (${p.cardType})` : ''}${p.approvalCode ? ` — ${p.approvalCode}` : ''}`
    if (p.method === 'ewallet') return `${p.ewalletType ?? 'E-Wallet'}${p.approvalCode ? ` — ${p.approvalCode}` : ''}`
    return `Payment (${p.method})`
  }, [])

  const buildLedger = useCallback((invList: SOAInvoice[]): LedgerEntry[] => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const threeDaysFromNow = new Date(today); threeDaysFromNow.setDate(today.getDate() + 3)
    type Raw = Omit<LedgerEntry, 'balance'>
    const entries: Raw[] = []
    for (const inv of invList) {
      const payments = inv.payments ?? []
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
      const fullyPaid = inv.balance < 0.01
      const hasDeposited = payments.some(p => p.method === 'check' && p.depositStatus === 'deposited')
      entries.push({
        date: new Date(inv.createdAt), reference: inv.invoiceNumber, description: 'Invoice',
        debit: inv.totalAmount, credit: 0, invoiceId: inv.id,
        lineItems: inv.lineItems ?? [], discountPct: inv.discountPct ?? 0,
        discountMode: inv.discountMode ?? 'PERCENT', deliveryFee: inv.deliveryFee ?? 0,
        vatAmount: inv.vatAmount ?? 0, withholdingTax: inv.withholdingTax ?? 0,
        rowColor: fullyPaid ? 'red' : null,
        markPaid: totalPaid > 0.01, markFull: fullyPaid,
        markPartial: !fullyPaid && totalPaid > 0.01, markDeposited: hasDeposited, checkAlert: null,
      })
      for (const p of payments) {
        const isDeposited = p.method === 'check' && p.depositStatus === 'deposited'
        const needsDeposit = p.method === 'check' && !isDeposited
        let checkAlert: 'overdue' | 'due_soon' | null = null
        if (needsDeposit && p.checkDate) {
          const cd = new Date(p.checkDate); cd.setHours(0, 0, 0, 0)
          if (cd <= today) checkAlert = 'overdue'
          else if (cd <= threeDaysFromNow) checkAlert = 'due_soon'
        }
        entries.push({
          date: new Date(p.paymentDate), reference: inv.invoiceNumber,
          description: `Payment — ${paymentLabel(p)}${p.referenceNo ? ` (${p.referenceNo})` : ''}`,
          debit: 0, credit: p.amount, invoiceId: null, lineItems: [],
          discountPct: 0, discountMode: 'PERCENT', deliveryFee: 0, vatAmount: 0, withholdingTax: 0,
          rowColor: isDeposited ? 'purple' : fullyPaid ? 'green' : 'orange',
          markPaid: true, markFull: fullyPaid, markPartial: !fullyPaid, markDeposited: isDeposited, checkAlert,
        })
      }
      for (const cn of (inv.creditNotes ?? [])) {
        entries.push({
          date: new Date(cn.createdAt), reference: cn.creditNoteNumber, description: 'Credit Note',
          debit: 0, credit: cn.amount, invoiceId: null, lineItems: [],
          discountPct: 0, discountMode: 'PERCENT', deliveryFee: 0, vatAmount: 0, withholdingTax: 0,
          rowColor: 'green', markPaid: true, markFull: false, markPartial: false, markDeposited: false, checkAlert: null,
        })
      }
    }
    entries.sort((a, b) => a.date.getTime() - b.date.getTime())
    let running = 0
    return entries.map(e => { running = running + e.debit - e.credit; return { ...e, balance: running } })
  }, [paymentLabel])

  const sortedInvoices = [...invoices].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const displayInvoices = includeHistory ? sortedInvoices : sortedInvoices.filter(inv => inv.balance > 0)
  const ledgerRows = buildLedger(displayInvoices)
  const totalDebit = ledgerRows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = ledgerRows.reduce((s, r) => s + r.credit, 0)
  const totalBalance = ledgerRows.length > 0 ? ledgerRows[ledgerRows.length - 1].balance : 0

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.phone ?? '').includes(q) ||
    (c.email ?? '').toLowerCase().includes(q.toLowerCase())
  )

  const presets = [
    { label: 'This Month', from: monthStart(now), to: monthEnd(now) },
    { label: 'Last Month', from: monthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: monthEnd(new Date(now.getFullYear(), now.getMonth() - 1, 1)) },
    { label: 'Last 3 Mo', from: ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: monthEnd(now) },
    { label: 'All Time', from: '2000-01-01', to: ymd(now) },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0">
        <BookOpen className="w-4 h-4 text-primary" />
        <span className="text-foreground font-semibold text-sm">Customer Ledger</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Customer List ─────────────────────────────────────────── */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col">
          <div className="p-2 border-b border-border">
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search customers..."
              className="w-full bg-card border border-border text-foreground text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingCustomers && <div className="p-3 text-xs text-muted-foreground">Loading...</div>}
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCustomer(c)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors ${selectedCustomer?.id === c.id ? 'bg-primary/15 border-l-2 border-l-primary' : 'hover:bg-muted/50'}`}
              >
                <div className="text-xs font-medium text-foreground truncate">{c.name}</div>
                {c.phone && <div className="text-[10px] text-muted-foreground truncate">{c.phone}</div>}
              </button>
            ))}
            {!loadingCustomers && filtered.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">No customers.</div>
            )}
          </div>
        </div>

        {/* ── Right: Ledger ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedCustomer ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a customer to view their ledger
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Customer info bar */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                  {selectedCustomer.name[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-foreground font-semibold text-sm">{selectedCustomer.name}</div>
                  {selectedCustomer.phone && <div className="text-xs text-muted-foreground">{selectedCustomer.phone}</div>}
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-end gap-3 bg-card rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">From</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                    className="bg-muted border border-border text-foreground text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">To</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                    className="bg-muted border border-border text-foreground text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="flex gap-1">
                  {presets.map(p => (
                    <button key={p.label} onClick={() => { setFromDate(p.from); setToDate(p.to) }}
                      className="px-2 py-1 text-[10px] bg-muted hover:bg-muted/80 text-foreground rounded transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto">
                  <input type="checkbox" checked={includeHistory} onChange={e => setIncludeHistory(e.target.checked)} className="rounded" />
                  Include paid
                </label>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-blue-800/50 bg-blue-950/30 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-blue-400 uppercase tracking-wide">Total Invoiced</span>
                    <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <p className="text-base font-bold text-blue-300 tabular-nums">{fmt(totalDebit)}</p>
                </div>
                <div className="rounded-lg border border-green-800/50 bg-green-950/30 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-green-400 uppercase tracking-wide">Total Paid</span>
                    <CreditCard className="w-3.5 h-3.5 text-green-500" />
                  </div>
                  <p className="text-base font-bold text-green-300 tabular-nums">{fmt(totalCredit)}</p>
                </div>
                <div className={`rounded-lg border p-3 ${totalBalance > 0 ? 'border-red-800/50 bg-red-950/30' : 'border-green-800/50 bg-green-950/30'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-medium uppercase tracking-wide ${totalBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>Outstanding</span>
                    <TrendingDown className={`w-3.5 h-3.5 ${totalBalance > 0 ? 'text-red-500' : 'text-green-500'}`} />
                  </div>
                  <p className={`text-base font-bold tabular-nums ${totalBalance > 0 ? 'text-red-300' : 'text-green-300'}`}>{fmt(totalBalance)}</p>
                </div>
              </div>

              {/* Color legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-700 shrink-0" />Fully-paid invoice</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-lime-600 shrink-0" />Final payment</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-600 shrink-0" />Partial payment</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500 shrink-0" />Deposited check</span>
              </div>

              {/* Ledger table */}
              {loadingLedger ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Loading...</div>
              ) : ledgerRows.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No transactions for this period.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-card border-b border-border text-left">
                        {['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance', 'Paid', 'Full', 'Partial', 'Dep.'].map((h, i) => (
                          <th key={i} className={`px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${i >= 3 ? 'text-right' : ''} ${i >= 6 ? 'text-center' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ledgerRows.map((entry, i) => {
                        const isInvoiceRow = !!entry.invoiceId && entry.debit > 0
                        const isExpanded = isInvoiceRow && expandedIds.has(entry.invoiceId!)
                        const rowCls = entry.rowColor ? COLOR_MAP[entry.rowColor] : 'text-foreground'
                        return (
                          <Fragment key={i}>
                            <tr
                              className={`transition-colors ${rowCls} ${isInvoiceRow ? 'cursor-pointer hover:brightness-110' : ''}`}
                              onClick={isInvoiceRow ? () => toggleExpand(entry.invoiceId!) : undefined}
                            >
                              <td className="px-3 py-2 whitespace-nowrap text-foreground">{fmtDate(entry.date)}</td>
                              <td className="px-3 py-2 font-medium whitespace-nowrap">
                                <span className="flex items-center gap-1">
                                  {isInvoiceRow && (isExpanded
                                    ? <ChevronDown className="w-3 h-3 shrink-0" />
                                    : <ChevronRight className="w-3 h-3 shrink-0" />)}
                                  {entry.reference}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-foreground max-w-[180px] truncate">
                                <span className="flex items-center gap-1">
                                  {entry.description}
                                  {entry.checkAlert === 'overdue' && <span className="text-red-400 font-bold text-[10px]">⚠ Overdue</span>}
                                  {entry.checkAlert === 'due_soon' && <span className="text-amber-400 font-bold text-[10px]">⚠ Due Soon</span>}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {entry.debit > 0 ? <span className="font-semibold text-red-400">{fmt(entry.debit)}</span> : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {entry.credit > 0 ? <span className="font-semibold text-green-600 dark:text-green-400">{fmt(entry.credit)}</span> : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className={`px-3 py-2 text-right font-bold tabular-nums ${entry.balance > 0 ? 'text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                {fmt(entry.balance)}
                              </td>
                              <td className="px-2 py-2 text-center">{entry.markPaid ? '✓' : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-2 py-2 text-center">{entry.markFull ? '✓' : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-2 py-2 text-center">{entry.markPartial ? '✓' : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-2 py-2 text-center">{entry.markDeposited ? '✓' : <span className="text-muted-foreground">—</span>}</td>
                            </tr>

                            {/* Expanded invoice line items */}
                            {isExpanded && entry.lineItems.length > 0 && (
                              <tr className="bg-background/80">
                                <td colSpan={10} className="px-4 py-2">
                                  <div className="rounded-lg border border-border overflow-hidden">
                                    <div className="grid grid-cols-[1fr_50px_110px_90px_110px] px-3 py-1.5 bg-card text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                                      <span>Product</span>
                                      <span className="text-right">Qty</span>
                                      <span className="text-right">Unit Price</span>
                                      <span className="text-right">Discount</span>
                                      <span className="text-right">Total</span>
                                    </div>
                                    {entry.lineItems.map(item => (
                                      <div key={item.id} className="grid grid-cols-[1fr_50px_110px_90px_110px] px-3 py-1.5 text-xs border-b border-border last:border-0 hover:bg-muted/50">
                                        <span className="truncate text-foreground">{item.productName}</span>
                                        <span className="text-right text-muted-foreground">{item.quantity}</span>
                                        <span className="text-right tabular-nums text-foreground">{fmt(item.unitPrice)}</span>
                                        <span className="text-right tabular-nums text-orange-400">
                                          {item.discount > 0 ? (item.discountType === 'percent' ? `${item.discount}%` : fmt(item.discount)) : <span className="text-muted-foreground">—</span>}
                                        </span>
                                        <span className="text-right font-semibold tabular-nums text-foreground">{fmt(item.total)}</span>
                                      </div>
                                    ))}
                                    {/* Summary rows */}
                                    {(() => {
                                      const subtotal = entry.lineItems.reduce((s, it) => s + it.total, 0)
                                      const discountAmt = entry.discountPct > 0
                                        ? entry.discountMode === 'AMOUNT' ? entry.discountPct : subtotal * (entry.discountPct / 100)
                                        : 0
                                      const summaryRows: { label: string; value: number; cls?: string }[] = [
                                        { label: 'Subtotal', value: subtotal },
                                        ...(discountAmt > 0 ? [{ label: entry.discountMode === 'AMOUNT' ? 'Discount' : `Discount (${entry.discountPct}%)`, value: -discountAmt, cls: 'text-orange-400' }] : []),
                                        ...(entry.deliveryFee > 0 ? [{ label: 'Delivery Fee', value: entry.deliveryFee }] : []),
                                        ...(entry.vatAmount > 0 ? [{ label: 'VAT (12%)', value: entry.vatAmount }] : []),
                                        ...(entry.withholdingTax > 0 ? [{ label: 'Withholding Tax', value: -entry.withholdingTax, cls: 'text-orange-400' }] : []),
                                      ]
                                      return (
                                        <div className="border-t border-dashed border-border bg-card/50">
                                          {summaryRows.map(r => (
                                            <div key={r.label} className="flex justify-between px-3 py-1 text-[11px]">
                                              <span className="text-muted-foreground">{r.label}</span>
                                              <span className={`tabular-nums ${r.cls ?? 'text-foreground'}`}>{r.value < 0 ? `− ${fmt(Math.abs(r.value))}` : fmt(r.value)}</span>
                                            </div>
                                          ))}
                                          <div className="flex justify-between px-3 py-1.5 text-xs font-bold border-t border-dashed border-border">
                                            <span className="text-foreground">Invoice Total</span>
                                            <span className="tabular-nums text-foreground">{fmt(entry.debit)}</span>
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-card border-t border-border">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-foreground">Closing Balance</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-red-400 tabular-nums">{fmt(totalDebit)}</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-green-600 dark:text-green-400 tabular-nums">{fmt(totalCredit)}</td>
                        <td className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${totalBalance > 0 ? 'text-red-400' : 'text-green-600 dark:text-green-400'}`}>{fmt(totalBalance)}</td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
