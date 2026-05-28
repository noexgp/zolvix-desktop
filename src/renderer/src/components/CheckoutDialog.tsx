import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { nanoid } from 'nanoid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Check, Banknote, CreditCard, Smartphone, ScrollText, Clock, Gift } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { printThermal } from '@/lib/escp'
import { cn } from '@/lib/utils'
import { paymentTotal, remaining } from '@/lib/cart'
import type { CartItem, PaymentEntry } from '@/lib/cart'
import type { CachedCustomer } from '@/lib/db'

type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'check' | 'charge' | 'gc'

const METHODS: { id: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { id: 'cash',    label: 'Cash',     icon: Banknote },
  { id: 'card',    label: 'Card',     icon: CreditCard },
  { id: 'ewallet', label: 'E-wallet', icon: Smartphone },
  { id: 'check',   label: 'Check',    icon: ScrollText },
  { id: 'charge',  label: 'Charge',   icon: Clock },
  { id: 'gc',      label: 'GC',       icon: Gift },
]

const CARD_PROVIDERS = ['Visa', 'Mastercard', 'Amex', 'JCB', 'UnionPay']
const EWALLET_PROVIDERS = ['GCash', 'Maya', 'ShopeePay', 'Grab Pay']
const CASH_BILLS = [20, 50, 100, 200, 500, 1000]

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  onClose: () => void
  onSuccess: () => void
}

function newPayment(method: PaymentMethod, amount: number): PaymentEntry {
  return { id: nanoid(), method, amount }
}

export default function CheckoutDialog({ cart, customer, total, onClose, onSuccess }: Props) {
  const [payments, setPayments] = useState<PaymentEntry[]>([newPayment('cash', total)])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ change: number; invoiceNumber: string } | null>(null)

  const paid    = paymentTotal(payments)
  const rem     = remaining(total, payments)
  const canPay  = rem < 0.005 && payments.every(p => p.method !== null)

  // Change is computed from the true amount due, never per-row `amount`, so the
  // inline preview and the success screen can never disagree.
  const nonCashApplied = payments
    .filter(p => p.method && p.method !== 'cash')
    .reduce((s, p) => s + (p.amount || 0), 0)
  const cashDue      = Math.max(0, Math.round((total - nonCashApplied) * 100) / 100)
  const cashReceived = payments
    .filter(p => p.method === 'cash')
    .reduce((s, p) => s + (p.cashTendered ?? p.amount ?? 0), 0)
  const changeDue    = Math.max(0, Math.round((cashReceived - cashDue) * 100) / 100)

  function updatePayment(id: string, patch: Partial<PaymentEntry>) {
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function addPayment() {
    setPayments(prev => {
      const currentPaid = prev.reduce((s, p) => s + (p.amount || 0), 0)
      const r = Math.round(Math.max(0, total - currentPaid) * 100) / 100
      return [...prev, newPayment('cash', r)]
    })
  }

  function removePayment(id: string) {
    setPayments(prev => prev.filter(p => p.id !== id))
  }

  // Set this row's amount to cover the whole remaining balance.
  function payRest(id: string) {
    setPayments(prev => {
      const others = prev.filter(p => p.id !== id).reduce((s, p) => s + (p.amount || 0), 0)
      const need = Math.round(Math.max(0, total - others) * 100) / 100
      return prev.map(p => p.id === id ? { ...p, amount: need } : p)
    })
  }

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer?.id,
          cart: cart.map(item => ({
            product: { id: item.product.id, price: item.product.price, name: item.product.name },
            quantity: item.quantity,
            discount: 0,
            orderType: 'TAKE_OUT',
            modifiers: [],
            comboItems: [],
          })),
          payments: payments.map(p => ({
            method: p.method,
            amount: p.amount,
            ...(p.cashTendered !== undefined && { cashTendered: p.cashTendered }),
            ...(p.cardProvider && { cardProvider: p.cardProvider }),
            ...(p.ewalletProvider && { ewalletProvider: p.ewalletProvider }),
            ...(p.approvalCode && { approvalCode: p.approvalCode }),
            ...(p.referenceNo && { referenceNo: p.referenceNo }),
            ...(p.checkNumber && { checkNumber: p.checkNumber }),
            ...(p.bankName && { bankName: p.bankName }),
            ...(p.checkDate && { checkDate: p.checkDate }),
            ...(p.checkPayorName && { checkPayorName: p.checkPayorName }),
          })),
          globalDiscount: 0,
          discountMode: 'PERCENT',
          deliveryFee: 0,
          withholdingTax: 0,
          ewtMode: 'DEDUCT',
          holders: [],
          partySize: 1,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Checkout failed')
      }
      const data = await res.json()

      // Print receipt
      try {
        await printThermal({
          invoiceNumber: data.invoiceNumber ?? data.invoice?.invoiceNumber ?? '',
          totalAmount: total,
          createdAt: data.createdAt ?? new Date().toISOString(),
          customer: customer ? { name: customer.name } : undefined,
          details: cart.map(item => ({
            quantity: item.quantity,
            unitPrice: item.product.price,
            total: item.product.price * item.quantity,
            product: { name: item.product.name },
          })),
        })
      } catch {
        // receipt print failure is non-fatal
      }

      const invoiceNumber = data.invoiceNumber ?? data.invoice?.invoiceNumber ?? ''
      setSuccess({ change: changeDue, invoiceNumber })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (success !== null) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-card border border-border rounded-xl p-8 w-80 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
            <Check className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <p className="text-foreground font-semibold">Payment Complete</p>
            {success.invoiceNumber && (
              <p className="text-muted-foreground text-xs mt-0.5">{success.invoiceNumber}</p>
            )}
          </div>
          {success.change > 0.005 && (
            <div className="bg-background rounded-lg py-3">
              <p className="text-muted-foreground text-xs">Change</p>
              <p className="text-green-500 text-4xl font-extrabold">₱{fmt(success.change)}</p>
            </div>
          )}
          <Button autoFocus className="w-full" onClick={onSuccess}>New Sale</Button>
        </div>
      </div>
    )
  }

  const isSplit = payments.length > 1
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-[540px] max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-foreground font-semibold">Checkout</h2>
            <p className="text-muted-foreground text-xs">{customer?.name ?? 'Walk-in'} · {cart.length} {cart.length === 1 ? 'item' : 'items'}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="text-muted-foreground hover:text-foreground rounded-md p-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sticky summary — always visible while splitting */}
        <div className="shrink-0 px-5 py-3 border-b border-border bg-background/50 space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Total Due</p>
              <p className="text-foreground text-2xl font-bold leading-none">₱{fmt(total)}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{rem > 0.005 ? 'Remaining' : 'Status'}</p>
              {rem > 0.005 ? (
                <p className="text-destructive text-lg font-bold leading-none">₱{fmt(rem)}</p>
              ) : (
                <p className="text-green-500 text-lg font-bold leading-none flex items-center gap-1 justify-end">
                  <Check className="w-4 h-4" /> Covered
                </p>
              )}
            </div>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-200', rem > 0.005 ? 'bg-primary' : 'bg-green-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Scrollable payment list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {payments.map((payment, idx) => (
            <div key={payment.id} className="bg-background rounded-lg p-4 space-y-3 border border-border">
              {isSplit && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs font-medium">Payment {idx + 1}</span>
                  <button
                    onClick={() => removePayment(payment.id)}
                    className="text-destructive text-xs hover:underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* Method selector — icon grid, touch-friendly */}
              <div className="grid grid-cols-3 gap-1.5">
                {METHODS.map(m => {
                  const Icon = m.icon
                  const selected = payment.method === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => updatePayment(payment.id, { method: m.id })}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {m.label}
                    </button>
                  )
                })}
              </div>

              {/* Amount + Pay rest */}
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-muted-foreground text-xs">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₱</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={payment.amount || ''}
                      onChange={e => updatePayment(payment.id, { amount: parseFloat(e.target.value) || 0 })}
                      className="h-9 text-sm pl-6"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 whitespace-nowrap text-xs"
                  onClick={() => payRest(payment.id)}
                >
                  Pay rest
                </Button>
              </div>

              {/* Cash: quick tender + change */}
              {payment.method === 'cash' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => updatePayment(payment.id, { cashTendered: payment.amount })}
                      className="px-2.5 py-1 rounded-md border border-border bg-card text-xs text-foreground hover:border-primary/50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Exact
                    </button>
                    {CASH_BILLS.filter(b => b > payment.amount).slice(0, 4).map(b => (
                      <button
                        key={b}
                        onClick={() => updatePayment(payment.id, { cashTendered: b })}
                        className={cn(
                          'px-2.5 py-1 rounded-md border text-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          payment.cashTendered === b
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/50'
                        )}
                      >
                        ₱{b}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₱</span>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Cash received"
                        value={payment.cashTendered ?? ''}
                        onChange={e => updatePayment(payment.id, { cashTendered: parseFloat(e.target.value) || undefined })}
                        className="h-9 text-sm pl-6"
                      />
                    </div>
                    {changeDue > 0.005 && (
                      <div className="text-right shrink-0">
                        <span className="text-muted-foreground text-[10px] block leading-none">Change</span>
                        <span className="text-green-500 text-base font-bold leading-none">₱{fmt(changeDue)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Card */}
              {payment.method === 'card' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Provider</Label>
                    <select
                      value={payment.cardProvider ?? ''}
                      onChange={e => updatePayment(payment.id, { cardProvider: e.target.value })}
                      className="w-full bg-card border border-border rounded text-foreground text-xs h-9 px-2 cursor-pointer"
                    >
                      <option value="">Select...</option>
                      {CARD_PROVIDERS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Approval Code</Label>
                    <Input value={payment.approvalCode ?? ''} onChange={e => updatePayment(payment.id, { approvalCode: e.target.value })} className="h-9 text-xs" />
                  </div>
                </div>
              )}

              {/* E-wallet */}
              {payment.method === 'ewallet' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Provider</Label>
                    <select
                      value={payment.ewalletProvider ?? ''}
                      onChange={e => updatePayment(payment.id, { ewalletProvider: e.target.value })}
                      className="w-full bg-card border border-border rounded text-foreground text-xs h-9 px-2 cursor-pointer"
                    >
                      <option value="">Select...</option>
                      {EWALLET_PROVIDERS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Reference No.</Label>
                    <Input value={payment.referenceNo ?? ''} onChange={e => updatePayment(payment.id, { referenceNo: e.target.value })} className="h-9 text-xs" />
                  </div>
                </div>
              )}

              {/* Check */}
              {payment.method === 'check' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Check No.</Label>
                    <Input value={payment.checkNumber ?? ''} onChange={e => updatePayment(payment.id, { checkNumber: e.target.value })} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Bank</Label>
                    <Input value={payment.bankName ?? ''} onChange={e => updatePayment(payment.id, { bankName: e.target.value })} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Date</Label>
                    <Input type="date" value={payment.checkDate ?? ''} onChange={e => updatePayment(payment.id, { checkDate: e.target.value })} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Payor Name</Label>
                    <Input value={payment.checkPayorName ?? ''} onChange={e => updatePayment(payment.id, { checkPayorName: e.target.value })} className="h-9 text-xs" />
                  </div>
                </div>
              )}

              {/* GC */}
              {payment.method === 'gc' && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Certificate Code</Label>
                  <Input value={payment.referenceNo ?? ''} onChange={e => updatePayment(payment.id, { referenceNo: e.target.value })} className="h-9 text-xs" />
                </div>
              )}
            </div>
          ))}

          {/* Split payment */}
          <button
            onClick={addPayment}
            className="w-full border border-dashed border-primary/40 text-primary text-sm rounded-lg py-2.5 hover:bg-primary/5 flex items-center justify-center gap-1.5 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="w-4 h-4" /> Split payment
          </button>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-border p-4 space-y-2">
          {error && <p className="text-destructive text-xs bg-destructive/10 rounded p-2">{error}</p>}
          <Button
            className="w-full h-11 font-semibold text-base"
            disabled={!canPay || submitting}
            onClick={handleSubmit}
          >
            {submitting
              ? 'Processing...'
              : rem > 0.005
                ? `₱${fmt(rem)} remaining`
                : `Confirm ₱${fmt(total)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
