import { useState, useMemo } from 'react'
import type { CachedProduct, CachedCustomer } from '@/lib/db'
import type { CartItem } from '@/lib/cart'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import SearchableSelect from '@/components/SearchableSelect'

interface Props {
  products: CachedProduct[]
  customers: CachedCustomer[]
  customer: CachedCustomer | null
  cart: CartItem[]
  onAddToCart: (product: CachedProduct) => void
  onSelectCustomer: (customer: CachedCustomer | null) => void
}

export default function ProductGrid({ products, customers, customer, cart, onAddToCart, onSelectCustomer }: Props) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  const categories = useMemo(() => {
    const ids = [...new Set(products.map(p => p.categoryId).filter(Boolean))]
    return ids
  }, [products])

  const cartIds = useMemo(() => new Set(cart.map(i => i.product.id)), [cart])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => {
      if (!p.isActive) return false
      if (categoryId && p.categoryId !== categoryId) return false
      if (q) return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? '').includes(q)
      return true
    })
  }, [products, search, categoryId])

  const customerItems = useMemo(() =>
    customers.map(c => ({ id: c.id, label: c.name })), [customers])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border shrink-0">
        <Input
          placeholder="Search products or scan barcode..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 h-8 text-sm"
        />
        <div className="w-48 shrink-0">
          <SearchableSelect
            value={customer?.id ?? ''}
            onChange={(id, _label) => {
              if (!id) { onSelectCustomer(null); return }
              onSelectCustomer(customers.find(c => c.id === id) ?? null)
            }}
            items={[{ id: '', label: 'Walk-in' }, ...customerItems]}
            placeholder="F1 Walk-in"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 px-3 py-1.5 bg-card border-b border-border shrink-0 overflow-x-auto">
        <button
          onClick={() => setCategoryId(null)}
          className={cn(
            'px-3 py-1 rounded text-xs whitespace-nowrap transition-colors',
            categoryId === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-background border border-border text-muted-foreground hover:text-foreground'
          )}
        >
          All
        </button>
        {categories.map(id => (
          <button
            key={id}
            onClick={() => setCategoryId(id === categoryId ? null : id)}
            className={cn(
              'px-3 py-1 rounded text-xs whitespace-nowrap transition-colors',
              categoryId === id
                ? 'bg-primary text-primary-foreground'
                : 'bg-background border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {id}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-4 gap-2 content-start">
        {filtered.map(product => {
          const inCart = cartIds.has(product.id)
          const outOfStock = product.stock === 0
          return (
            <button
              key={product.id}
              onClick={() => onAddToCart(product)}
              disabled={outOfStock}
              className={cn(
                'relative flex flex-col items-center text-center rounded-lg border p-3 transition-all',
                'bg-card hover:bg-accent',
                inCart && !outOfStock ? 'border-primary/50' : 'border-border',
                outOfStock && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="w-full h-12 bg-background rounded mb-2 flex items-center justify-center text-2xl">
                🏷️
              </div>
              <div className="text-xs text-foreground leading-tight mb-1 line-clamp-2">{product.name}</div>
              <div className="text-sm font-bold text-primary">₱{Number(product.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
              {inCart && !outOfStock && (
                <span className="absolute top-1.5 right-1.5 bg-primary/20 text-primary text-[9px] rounded px-1">in cart</span>
              )}
              {outOfStock && (
                <span className="absolute top-1.5 right-1.5 bg-destructive/20 text-destructive text-[9px] rounded px-1">out of stock</span>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-4 text-center text-muted-foreground text-sm py-12">
            No products found
          </div>
        )}
      </div>
    </div>
  )
}
