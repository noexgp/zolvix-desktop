import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Check } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { printThermal } from '@/lib/escp'
import { cn } from '@/lib/utils'
import { paymentTotal, remaining } from '@/lib/cart'
import type { CartItem, PaymentEntry } from '@/lib/cart'
import type { CachedCustomer } from '@/lib/db'

type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'check' | 'charge' | 'gc'

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash',    label: 'Cash' },
  { id: 'card',    label: 'Card' },
  { id: 'ewallet', label: 'E-wallet' },
  { id: 'check',   label: 'Check' },
  { id: 'charge',  label: 'Charge' },
  { id: 'gc',      label: 'GC' },
]

const CARD_PROVIDERS = ['Visa', 'Mastercard', 'Amex', 'JCB', 'UnionPay']
const EWALLET_PROVIDERS = ['GCash', 'Maya', 'ShopeePay', 'Grab Pay']

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

      // Compute change — aggregate all cash rows, subtract non-cash from total
      const cashPaid = payments
        .filter(p => p.method === 'cash')
        .reduce((sum, p) => sum + (p.cashTendered ?? p.amount), 0)
      const nonCashPaid = payments
        .filter(p => p.method !== 'cash')
        .reduce((sum, p) => sum + p.amount, 0)
      const cashChange = Math.max(0, Math.round((cashPaid - (total - nonCashPaid)) * 100) / 100)

      const invoiceNumber = data.invoiceNumber ?? data.invoice?.invoiceNumber ?? ''
      setSuccess({ change: cashChange, invoiceNumber })
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
          <Button className="w-full" onClick={onSuccess}>New Sale</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-foreground font-semibold">Checkout</h2>
            <p className="text-muted-foreground text-xs">{customer?.name ?? 'Walk-in'} · Total ₱{fmt(total)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Payments */}
        <div className="p-5 space-y-4">
          {payments.map((payment, idx) => (
            <div key={payment.id} className="bg-background rounded-lg p-4 space-y-3 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">Payment {idx + 1}</span>
                {payments.length > 1 && (
                  <button onClick={() => removePayment(payment.id)} className="text-destructive text-xs">Remove</button>
                )}
              </div>

              {/* Method selector */}
              <div className="flex gap-1 flex-wrap">
                {METHODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => updatePayment(payment.id, { method: m.id })}
                    className={cn(
                      'px-3 py-1 rounded text-xs transition-colors',
                      payment.method === m.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payment.amount || ''}
                  onChange={e => updatePayment(payment.id, { amount: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-sm"
                />
              </div>

              {/* Cash: tendered */}
              {payment.method === 'cash' && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Cash Tendered (optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={String(payment.amount)}
                    value={payment.cashTendered ?? ''}
                    onChange={e => updatePayment(payment.id, { cashTendered: parseFloat(e.target.value) || undefined })}
                    className="h-8 text-sm"
                  />
                  {(payment.cashTendered ?? payment.amount) > payment.amount && (
                    <p className="text-green-500 text-xs">Change: ₱{fmt((payment.cashTendered ?? payment.amount) - payment.amount)}</p>
                  )}
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
                      className="w-full bg-card border border-border rounded text-foreground text-xs h-8 px-2"
                    >
                      <option value="">Select...</option>
                      {CARD_PROVIDERS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Approval Code</Label>
                    <Input value={payment.approvalCode ?? ''} onChange={e => updatePayment(payment.id, { approvalCode: e.target.value })} className="h-8 text-xs" />
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
                      className="w-full bg-card border border-border rounded text-foreground text-xs h-8 px-2"
                    >
                      <option value="">Select...</option>
                      {EWALLET_PROVIDERS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Reference No.</Label>
                    <Input value={payment.referenceNo ?? ''} onChange={e => updatePayment(payment.id, { referenceNo: e.target.value })} className="h-8 text-xs" />
                  </div>
                </div>
              )}

              {/* Check */}
              {payment.method === 'check' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Check No.</Label>
                    <Input value={payment.checkNumber ?? ''} onChange={e => updatePayment(payment.id, { checkNumber: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Bank</Label>
                    <Input value={payment.bankName ?? ''} onChange={e => updatePayment(payment.id, { bankName: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Date</Label>
                    <Input type="date" value={payment.checkDate ?? ''} onChange={e => updatePayment(payment.id, { checkDate: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Payor Name</Label>
                    <Input value={payment.checkPayorName ?? ''} onChange={e => updatePayment(payment.id, { checkPayorName: e.target.value })} className="h-8 text-xs" />
                  </div>
                </div>
              )}

              {/* GC */}
              {payment.method === 'gc' && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Certificate Code</Label>
                  <Input value={payment.referenceNo ?? ''} onChange={e => updatePayment(payment.id, { referenceNo: e.target.value })} className="h-8 text-xs" />
                </div>
              )}
            </div>
          ))}

          {/* Add payment */}
          <button
            onClick={addPayment}
            className="w-full border border-dashed border-primary/40 text-primary text-xs rounded-lg py-2 hover:bg-primary/5 flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add Payment
          </button>

          {/* Summary */}
          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="text-foreground">₱{fmt(total)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-foreground">₱{fmt(paid)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-muted-foreground">Remaining</span>
              <span className={rem > 0 ? 'text-destructive' : 'text-green-500'}>₱{fmt(rem)}</span>
            </div>
          </div>

          {error && <p className="text-destructive text-xs bg-destructive/10 rounded p-2">{error}</p>}

          <Button
            className="w-full font-semibold"
            disabled={!canPay || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Processing...' : `Confirm Payment ₱${fmt(total)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
