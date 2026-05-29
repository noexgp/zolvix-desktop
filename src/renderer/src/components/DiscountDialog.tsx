import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HolderType, Holder, PrivilegedDiscount } from '@/lib/discount'
import { HOLDER_LABELS } from '@/lib/discount'

interface Props {
  current: PrivilegedDiscount | null
  onApply: (d: PrivilegedDiscount) => void
  onRemove: () => void
  onClose: () => void
}

const TYPES: HolderType[] = ['SC', 'PWD', 'SOLO_PARENT']
const emptyHolder = (): Holder => ({ holderType: 'SC', holderName: '', holderId: '' })

export default function DiscountDialog({ current, onApply, onRemove, onClose }: Props) {
  const [holders, setHolders] = useState<Holder[]>(current?.holders?.length ? current.holders : [emptyHolder()])
  const [partySize, setPartySize] = useState<number>(current?.partySize ?? 1)

  const update = (i: number, patch: Partial<Holder>) =>
    setHolders(hs => hs.map((h, idx) => (idx === i ? { ...h, ...patch } : h)))
  const addHolder = () => setHolders(hs => [...hs, emptyHolder()])
  const removeHolder = (i: number) => setHolders(hs => hs.filter((_, idx) => idx !== i))

  const effectiveParty = Math.max(partySize, holders.length)
  const allValid = holders.every(h => h.holderName.trim() && h.holderId.trim())
  const canApply = holders.length > 0 && allValid

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-[28rem] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-foreground font-semibold">Privileged Discount</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Head Count (party size)</Label>
            <Input
              type="number"
              min={holders.length}
              value={partySize}
              onChange={e => setPartySize(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 text-sm w-28"
            />
            <p className="text-[11px] text-muted-foreground">{holders.length} card holder(s) of {effectiveParty} — discount applies to their share.</p>
          </div>

          {holders.map((h, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Holder {i + 1}</span>
                {holders.length > 1 && (
                  <button onClick={() => removeHolder(i)} aria-label="Remove holder" className="text-muted-foreground hover:text-destructive cursor-pointer rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => update(i, { holderType: t })}
                    className={cn(
                      'rounded-lg py-1.5 text-[11px] font-medium border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      h.holderType === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {HOLDER_LABELS[t]}
                  </button>
                ))}
              </div>
              <Input value={h.holderName} onChange={e => update(i, { holderName: e.target.value })} placeholder="Holder name" className="h-9 text-sm" />
              <Input value={h.holderId} onChange={e => update(i, { holderId: e.target.value })} placeholder="ID No. (OSCA / PWD / Solo Parent)" className="h-9 text-sm" />
            </div>
          ))}

          <button onClick={addHolder} className="flex items-center gap-1 text-primary text-xs hover:bg-primary/5 rounded px-2 py-1.5 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="w-3.5 h-3.5" /> Add holder
          </button>

          <div className="flex gap-2 pt-1">
            {current && (
              <Button variant="secondary" className="flex-1" onClick={onRemove}>Remove</Button>
            )}
            <Button
              className="flex-[2]"
              disabled={!canApply}
              onClick={() => onApply({
                holders: holders.map(h => ({ holderType: h.holderType, holderName: h.holderName.trim(), holderId: h.holderId.trim() })),
                partySize: effectiveParty,
              })}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
