import type { CartItem } from '@/lib/cart'
import { lineTotal } from '@/lib/cart'
import type { CachedCustomer } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Minus, Plus, X } from 'lucide-react'

interface Props {
  cart: CartItem[]
  customer: CachedCustomer | null
  total: number
  onUpdateQty: (productId: string, qty: number) => void
  onRemoveItem: (productId: string) => void
  onClear: () => void
  onHold: () => void
  onCheckout: () => void
}

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CartSidebar({ cart, customer, total, onUpdateQty, onRemoveItem, onClear, onHold, onCheckout }: Props) {
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)
  const customerName = customer?.name ?? 'Walk-in'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Customer-facing total banner */}
      <div className="shrink-0 bg-gradient-to-br from-blue-700 to-violet-700 px-4 py-4 text-center border-b-2 border-violet-600">
        <p className="text-blue-200 text-[10px] tracking-[0.15em] uppercase mb-0.5">Amount Due</p>
        <p className="text-white text-4xl font-extrabold tracking-tight leading-none">
          ₱{fmt(total)}
        </p>
        <p className="text-blue-300 text-[10px] mt-1">{customerName} · {itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
      </div>

      {/* Cart controls */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-card border-b border-border">
        <span className="text-muted-foreground text-xs">Cart</span>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-destructive text-xs hover:underline">Clear</button>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {cart.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-8">Cart is empty</p>
        )}
        {cart.map(item => (
          <div key={item.product.id} className="bg-background rounded-md p-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-foreground text-xs leading-tight flex-1">{item.product.name}</span>
              <span className="text-primary text-xs font-semibold whitespace-nowrap">
                ₱{fmt(lineTotal(item.product, item.quantity))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-card rounded border border-border">
                <button
                  onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                  className="px-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-foreground text-xs px-2 min-w-[24px] text-center">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                  className="px-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <span className="text-muted-foreground text-[10px]">₱{fmt(item.product.price)} ea</span>
              <button onClick={() => onRemoveItem(item.product.id)} className="ml-auto text-destructive hover:text-destructive/80">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-card border-t border-border p-3">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 text-xs"
            disabled={cart.length === 0}
            onClick={onHold}
          >
            Hold F2
          </Button>
          <Button
            size="sm"
            className="flex-[2] text-sm font-semibold"
            disabled={cart.length === 0}
            onClick={onCheckout}
          >
            Checkout F3 →
          </Button>
        </div>
      </div>
    </div>
  )
}
