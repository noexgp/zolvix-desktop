import { useState, useEffect } from 'react'
import type { CartItem } from '@/lib/cart'
import { lineTotal, lineNet, lineDiscountAmount } from '@/lib/cart'
import type { CachedCustomer } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Minus, Plus, X, ShoppingCart, Trash2, Pause, ArrowRight, Tag, Percent } from 'lucide-react'

function QtyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9]/g, '')
        setText(v)
        const n = parseInt(v, 10)
        if (!isNaN(n) && n >= 1) onChange(n)
      }}
      onBlur={() => { if (!/^[1-9][0-9]*$/.test(text)) setText(String(value)) }}
      onFocus={e => e.target.select()}
      className="w-8 bg-transparent text-foreground text-sm font-medium text-center outline-none"
    />
  )
}

interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  discountLabel: string | null
  discountAmount: number
  lineDiscountEnabled: boolean
  onUpdateQty: (productId: string, qty: number) => void
  onRemoveItem: (productId: string) => void
  onClear: () => void
  onHold: () => void
  onCheckout: () => void
  onOpenDiscount: () => void
  onRemoveDiscount: () => void
  onSetLineDiscount: (productIds: string[], mode: 'PESO' | 'PERCENT', value: number) => void
  onClearLineDiscount: (productId: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CartSidebar({ cart, customer, total, discountLabel, discountAmount, lineDiscountEnabled, onUpdateQty, onRemoveItem, onClear, onHold, onCheckout, onOpenDiscount, onRemoveDiscount, onSetLineDiscount, onClearLineDiscount }: Props) {
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)
  const customerName = customer?.name ?? 'Walk-in'

  const hasLineDiscount = cart.some(i => (i.discountPct ?? 0) > 0)
  const lineDiscountActive = lineDiscountEnabled && !discountLabel
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'PESO' | 'PERCENT'>('PERCENT')
  const [value, setValue] = useState('')

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const apply = () => {
    const v = Number(value)
    if (!selected.size || !Number.isFinite(v) || v <= 0) return
    onSetLineDiscount([...selected], mode, v)
    setSelected(new Set())
    setValue('')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-gradient-to-br from-orange-500 to-amber-600 px-4 py-4 text-center border-b-2 border-orange-600">
        <p className="text-orange-100 text-[10px] tracking-[0.15em] uppercase mb-0.5">Amount Due</p>
        <p className="text-white text-4xl font-extrabold tracking-tight leading-none">₱{fmt(total)}</p>
        <p className="text-orange-100 text-[10px] mt-1">{customerName} · {itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
      </div>

      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-card border-b border-border">
        <span className="text-muted-foreground text-xs font-medium">
          {cart.length === 0 ? 'Cart' : `${cart.length} ${cart.length === 1 ? 'line' : 'lines'}`}
        </span>
        {cart.length > 0 && (
          <button onClick={onClear} className="flex items-center gap-1 text-destructive text-xs hover:bg-destructive/10 rounded px-2 py-1 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {cart.length === 0 && (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-16 gap-2">
            <ShoppingCart className="w-8 h-8 opacity-30" />
            <p className="text-xs">Cart is empty</p>
            <p className="text-[10px] opacity-70">Tap a product to add it</p>
          </div>
        )}
        {cart.map(item => {
          const pct = item.discountPct ?? 0
          const gross = lineTotal(item.product, item.quantity)
          return (
            <div key={item.product.id} className="bg-background rounded-lg p-2.5 space-y-2 border border-transparent hover:border-border transition-colors">
              <div className="flex items-start justify-between gap-2">
                {lineDiscountActive && (
                  <input
                    type="checkbox"
                    aria-label="Select line for discount"
                    checked={selected.has(item.product.id)}
                    onChange={() => toggle(item.product.id)}
                    className="mt-0.5 cursor-pointer"
                  />
                )}
                <span className="text-foreground text-xs font-medium leading-tight flex-1 line-clamp-2">{item.product.name}</span>
                <button onClick={() => onRemoveItem(item.product.id)} aria-label="Remove item" className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0 rounded p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center bg-card rounded-lg border border-border overflow-hidden">
                  <button onClick={() => onUpdateQty(item.product.id, item.quantity - 1)} aria-label="Decrease quantity" className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Minus className="w-3 h-3" />
                  </button>
                  <QtyInput value={item.quantity} onChange={qty => onUpdateQty(item.product.id, qty)} />
                  <button onClick={() => onUpdateQty(item.product.id, item.quantity + 1)} aria-label="Increase quantity" className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-right">
                  {pct > 0 ? (
                    <>
                      <div className="text-foreground text-sm font-semibold whitespace-nowrap">₱{fmt(lineNet(item))}</div>
                      <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 justify-end">
                        −₱{fmt(lineDiscountAmount(item))} ({fmt(pct)}%)
                        <button onClick={() => onClearLineDiscount(item.product.id)} aria-label="Clear line discount" className="text-muted-foreground hover:text-destructive cursor-pointer rounded">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-muted-foreground text-[10px] line-through">₱{fmt(gross)}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-foreground text-sm font-semibold whitespace-nowrap">₱{fmt(gross)}</div>
                      <div className="text-muted-foreground text-[10px]">₱{fmt(item.product.price)} ea</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 bg-card border-t border-border p-3 space-y-2">
        {lineDiscountActive && selected.size > 0 && (
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2 py-1.5">
            <div className="flex rounded-md border border-border overflow-hidden">
              <button onClick={() => setMode('PERCENT')} className={`px-2 py-1 text-xs cursor-pointer ${mode === 'PERCENT' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>%</button>
              <button onClick={() => setMode('PESO')} className={`px-2 py-1 text-xs cursor-pointer ${mode === 'PESO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>₱</button>
            </div>
            <input type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder={mode === 'PERCENT' ? '% off' : '₱ off'} className="flex-1 h-8 px-2 rounded-md border border-border bg-card text-sm outline-none" />
            <Button size="sm" className="h-8 text-xs" onClick={apply}>Apply to {selected.size}</Button>
          </div>
        )}
        {discountLabel ? (
          <div className="flex items-center justify-between bg-background border border-border rounded-lg px-2.5 py-1.5">
            <span className="text-xs text-foreground truncate">{discountLabel}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-green-500">−₱{fmt(discountAmount)}</span>
              <button onClick={onRemoveDiscount} aria-label="Remove discount" className="text-muted-foreground hover:text-destructive cursor-pointer rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onOpenDiscount}
            disabled={cart.length === 0 || hasLineDiscount}
            title={hasLineDiscount ? 'Remove line discounts first' : undefined}
            className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border text-muted-foreground text-xs rounded-lg py-2 hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Tag className="w-3.5 h-3.5" /> SC / PWD / Solo Parent
          </button>
        )}
        {lineDiscountActive && !hasLineDiscount && selected.size === 0 && cart.length > 0 && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Percent className="w-3 h-3" /> Tick lines, then set a ₱/% discount.</p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1 h-10 text-xs gap-1.5" disabled={cart.length === 0} onClick={onHold}>
            <Pause className="w-3.5 h-3.5" /> Hold
            <kbd className="text-[9px] opacity-60 font-mono">F2</kbd>
          </Button>
          <Button size="sm" className="flex-[2] h-10 text-sm font-semibold gap-1.5" disabled={cart.length === 0} onClick={onCheckout}>
            Checkout
            <kbd className="text-[9px] opacity-70 font-mono">F3</kbd>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
