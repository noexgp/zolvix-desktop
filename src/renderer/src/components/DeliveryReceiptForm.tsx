// src/renderer/src/components/DeliveryReceiptForm.tsx
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import { invalidateCache } from '@/lib/db'

interface SODetail { id: string; productId: string; productName: string; quantity: number; unitPrice: number; deliveredQty: number }

interface Props {
  open: boolean
  onClose: () => void
  soId: string
  details: SODetail[]
  onSuccess: () => void
}

export default function DeliveryReceiptForm({ open, onClose, soId, details, onSuccess }: Props) {
  const [lines, setLines] = useState<Record<string, number>>(() =>
    Object.fromEntries(details.map(d => [d.id, Math.max(0, d.quantity - d.deliveredQty)]))
  )
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  })
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLines(
      Object.fromEntries(
        details.map(d => [d.id, Math.max(0, d.quantity - d.deliveredQty)])
      )
    )
    setError('')
    setNotes('')
  }, [open, soId])

  function setQty(detailId: string, val: number) {
    const d = details.find(d => d.id === detailId)
    if (!d) return
    const max = d.quantity - d.deliveredQty
    setLines(prev => ({ ...prev, [detailId]: Math.min(Math.max(0, val), max) }))
  }

  async function handleSubmit() {
    const submitLines = details
      .filter(d => (lines[d.id] ?? 0) > 0)
      .map(d => ({
        soDetailId: d.id,
        productId: d.productId,
        quantity: lines[d.id],
        unitPrice: d.unitPrice,
        total: lines[d.id] * d.unitPrice,
      }))
    if (submitLines.length === 0) { setError('Enter at least one quantity > 0.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/sales-orders/${soId}/delivery`, {
        method: 'POST',
        body: JSON.stringify({ deliveryDate, notes, lines: submitLines }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to create DR')
      }
      const drData = await res.json().catch(() => ({}))
      const drId = drData?.deliveryReceipt?.id
      if (drId) {
        // Auto-confirm the DR so deliveredQty updates and SO transitions to delivered.
        // Silently skipped if the user lacks the ADMIN/MANAGER role — manager confirms manually.
        await apiFetch(`/api/delivery-receipts/${drId}/confirm`, { method: 'POST' }).catch(() => {})
      }
      await invalidateCache('salesOrders')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create DR')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-background text-foreground border-border max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Delivery</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="delivery-date" className="text-foreground text-xs">Delivery Date</Label>
            <Input id="delivery-date" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
              className="bg-card border-border text-foreground" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="delivery-notes" className="text-foreground text-xs">Notes</Label>
            <Input id="delivery-notes" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..." className="bg-card border-border text-foreground" />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground grid grid-cols-3 gap-2 font-medium">
              <span>Product</span><span className="text-center">Ordered / Delivered</span><span className="text-center">Deliver Qty</span>
            </div>
            {details.map(d => {
              const remaining = d.quantity - d.deliveredQty
              return (
                <div key={d.id} className="grid grid-cols-3 gap-2 items-center bg-card rounded p-2 text-xs">
                  <span className="text-foreground truncate">{d.productName}</span>
                  <span className="text-center text-muted-foreground">{d.quantity} / {d.deliveredQty}</span>
                  <Input
                    aria-label={`Deliver quantity for ${d.productName}`}
                    type="number" min={0} max={remaining}
                    value={lines[d.id] ?? 0}
                    onChange={e => setQty(d.id, Number(e.target.value))}
                    disabled={remaining === 0}
                    className="bg-muted border-0 text-foreground h-7 text-xs"
                  />
                </div>
              )
            })}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Create DR'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
