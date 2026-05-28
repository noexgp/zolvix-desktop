import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HolderType } from '@/lib/discount'
import { HOLDER_LABELS } from '@/lib/discount'

export interface Holder {
  holderType: HolderType
  holderName: string
  holderId: string
}

interface Props {
  current: Holder | null
  onApply: (h: Holder) => void
  onRemove: () => void
  onClose: () => void
}

const TYPES: HolderType[] = ['SC', 'PWD', 'SOLO_PARENT']

export default function DiscountDialog({ current, onApply, onRemove, onClose }: Props) {
  const [type, setType] = useState<HolderType>(current?.holderType ?? 'SC')
  const [name, setName] = useState(current?.holderName ?? '')
  const [id, setId] = useState(current?.holderId ?? '')

  const canApply = name.trim().length > 0 && id.trim().length > 0

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-96 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-foreground font-semibold">Privileged Discount</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-1.5">
            {TYPES.map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'rounded-lg py-2 text-xs font-medium border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  type === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {HOLDER_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Holder Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">ID No. (OSCA / PWD / Solo Parent)</Label>
            <Input value={id} onChange={e => setId(e.target.value)} className="h-9 text-sm" />
          </div>

          <div className="flex gap-2 pt-1">
            {current && (
              <Button variant="secondary" className="flex-1" onClick={onRemove}>Remove</Button>
            )}
            <Button
              className="flex-[2]"
              disabled={!canApply}
              onClick={() => onApply({ holderType: type, holderName: name.trim(), holderId: id.trim() })}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
