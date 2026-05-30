import { useState, useMemo, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { CachedProduct, CachedCustomer } from '@/lib/db'
import type { CartItem } from '@/lib/cart'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Search, Plus, PackageX, Loader2 } from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { isLikelyCode, scanProduct } from '@/hooks/useSalesProducts'
import { useCustomerSearch } from '@/hooks/useCustomerSearch'
import { gridColsFromComputedStyle } from '@/lib/grid-cols'

interface Props {
  products: CachedProduct[]
  customers: CachedCustomer[]
  customer: CachedCustomer | null
  cart: CartItem[]
  categoryNames: Record<string, string>
  searchRef?: RefObject<HTMLInputElement | null>
  search: string
  onSearchChange: (value: string) => void
  loading?: boolean
  onAddToCart: (product: CachedProduct) => void
  onSelectCustomer: (customer: CachedCustomer | null) => void
}

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const LOW_STOCK = 5

export default function ProductGrid({ products, customers, customer, cart, categoryNames, searchRef, search, onSearchChange, loading, onAddToCart, onSelectCustomer }: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [searchFocused, setSearchFocused] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const { customers: searchedCustomers } = useCustomerSearch({ search: customerSearch })
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridCols, setGridCols] = useState(4)

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) {
      if (p.categoryId) map.set(p.categoryId, categoryNames[p.categoryId] || p.categoryName || p.categoryId)
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [products, categoryNames])

  const cartQty = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of cart) m.set(i.product.id, i.quantity)
    return m
  }, [cart])

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!p.isActive) return false
      if (categoryId && p.categoryId !== categoryId) return false
      return true
    })
  }, [products, categoryId])

  const customerItems = useMemo(() =>
    searchedCustomers.map(c => ({ id: c.id, label: c.name })), [searchedCustomers])

  // Reset the keyboard highlight to the top match whenever the result set changes.
  useEffect(() => { setHighlight(0) }, [search, categoryId])

  // Keep the highlighted card scrolled into view while navigating.
  useEffect(() => {
    if (!searchFocused) return
    gridRef.current?.querySelector(`[data-idx="${highlight}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [highlight, searchFocused])

  // Track the actual rendered column count via ResizeObserver.
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const update = () => setGridCols(gridColsFromComputedStyle(getComputedStyle(el).gridTemplateColumns))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  async function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter runs first so a barcode scan can race the debounced search.
    if (e.key === 'Enter') {
      e.preventDefault()
      const q = search.trim()
      if (q && isLikelyCode(q)) {
        const scanned = await scanProduct(q)
        if (scanned && scanned.stock !== 0) {
          onAddToCart(scanned)
          onSearchChange('')
          searchRef?.current?.select()
          return
        }
      }
      // Fall through: highlighted-Enter behavior (works even when search is empty).
      const p = filtered[highlight]
      if (p && p.stock !== 0) {
        onAddToCart(p)
        e.currentTarget.select()
      }
      return
    }
    // Arrow navigation needs something visible.
    if (filtered.length === 0) return
    const last = filtered.length - 1
    if (e.key === 'ArrowRight') { e.preventDefault(); setHighlight(i => Math.min(last, i + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setHighlight(i => Math.max(0, i - 1)) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => Math.min(last, i + gridCols)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => Math.max(0, i - gridCols)) }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-card border-b border-border shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          {loading && (
            <Loader2
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground pointer-events-none"
              aria-label="Loading products"
            />
          )}
          <Input
            ref={searchRef}
            placeholder="Search products or scan barcode...  (F1)"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="h-9 text-sm pl-8 pr-8"
          />
        </div>
        <div className="w-52 shrink-0">
          <SearchableSelect
            value={customer?.id ?? ''}
            onChange={(id, _label) => {
              if (!id) { onSelectCustomer(null); return }
              onSelectCustomer(
                customers.find(c => c.id === id)
                ?? (searchedCustomers.find(c => c.id === id) ?? null)
              )
            }}
            items={[
              { id: '', label: 'Walk-in' },
              ...(customer && !customerItems.some(c => c.id === customer.id)
                ? [{ id: customer.id, label: customer.name }]
                : []),
              ...customerItems,
            ]}
            placeholder="Walk-in"
            className="h-9 text-sm"
            onSearchChange={setCustomerSearch}
            onAfterSelect={() => { searchRef?.current?.focus(); searchRef?.current?.select() }}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 px-3 py-2 bg-card border-b border-border shrink-0 overflow-x-auto">
        <button
          onClick={() => setCategoryId(null)}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            categoryId === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
          )}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategoryId(cat.id === categoryId ? null : cat.id)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              categoryId === cat.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto p-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 content-start">
        {filtered.map((product, idx) => {
          const qty = cartQty.get(product.id) ?? 0
          const inCart = qty > 0
          const outOfStock = product.stock === 0
          const lowStock = !outOfStock && product.stock <= LOW_STOCK
          const highlighted = searchFocused && idx === highlight
          return (
            <button
              key={product.id}
              data-idx={idx}
              onClick={() => onAddToCart(product)}
              disabled={outOfStock}
              className={cn(
                'group relative flex flex-col rounded-xl border bg-card p-3 text-left transition-colors cursor-pointer',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'hover:border-primary/60 hover:bg-accent/40',
                inCart && !outOfStock ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border',
                highlighted && 'border-primary ring-2 ring-primary bg-accent/40',
                outOfStock && 'opacity-55 cursor-not-allowed hover:border-border hover:bg-card'
              )}
            >
              {/* Top row: initial tile + status badge */}
              <div className="flex items-start justify-between mb-2">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold uppercase shrink-0">
                  {product.name.charAt(0) || '#'}
                </div>
                {inCart && !outOfStock && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                    {qty}
                  </span>
                )}
                {outOfStock && (
                  <span className="flex items-center gap-1 bg-destructive/15 text-destructive text-[9px] font-medium rounded-full px-1.5 py-0.5">
                    <PackageX className="w-3 h-3" /> Out
                  </span>
                )}
              </div>

              {/* Name */}
              <div className="text-xs font-medium text-foreground leading-snug line-clamp-2 min-h-[2rem]">
                {product.name}
              </div>

              {/* Footer: price + low stock + add affordance */}
              <div className="mt-2 flex items-end justify-between gap-1">
                <div>
                  <div className="text-sm font-bold text-foreground">₱{fmt(Number(product.price))}</div>
                  {lowStock && (
                    <div className="text-[10px] text-amber-500 font-medium">{product.stock} left</div>
                  )}
                </div>
                {!outOfStock && (
                  <span className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-4 flex flex-col items-center justify-center text-muted-foreground py-16 gap-2">
            <PackageX className="w-8 h-8 opacity-40" />
            <p className="text-sm">No products found</p>
            {search && <p className="text-xs">Try a different search term</p>}
          </div>
        )}
      </div>
    </div>
  )
}
