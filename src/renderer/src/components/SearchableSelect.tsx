import { useEffect, useRef, useState } from 'react'

interface Props {
  id?: string
  value: string
  onChange: (id: string, label: string) => void
  items: { id: string; label: string }[]
  placeholder: string
  disabled?: boolean
  className?: string
  /** When provided, the parent owns filtering: this component stops its internal `.includes()` filter and just renders `items` as-is. Also called whenever the user clears/types in the picker. */
  onSearchChange?: (q: string) => void
  /** Called shortly after a selection. When provided, REPLACES the default "focus next focusable element" behavior. Useful when the parent wants focus to land on a specific input. */
  onAfterSelect?: () => void
}

export default function SearchableSelect({ id, value, onChange, items, placeholder, disabled, className, onSearchChange, onAfterSelect }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = items.find(i => i.id === value)
  const displayValue = open ? query : (selected?.label ?? '')

  const filtered = onSearchChange
    ? items
    : query ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase())) : items

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery(''); setHighlightIndex(-1); onSearchChange?.('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIndex])

  function selectItem(item: { id: string; label: string }) {
    onChange(item.id, item.label)
    setQuery(''); setOpen(false); setHighlightIndex(-1); onSearchChange?.('')
    if (onAfterSelect) {
      setTimeout(onAfterSelect, 0)
      return
    }
    setTimeout(() => {
      const focusable = Array.from(document.querySelectorAll<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
      ))
      const idx = focusable.indexOf(inputRef.current!)
      if (idx >= 0 && focusable[idx + 1]) focusable[idx + 1].focus()
    }, 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && e.key === 'ArrowDown') { setOpen(true); setHighlightIndex(0); e.preventDefault(); return }
    if (!open) return
    if (e.key === 'ArrowDown') { setHighlightIndex(i => Math.min(i + 1, filtered.length - 1)); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setHighlightIndex(i => Math.max(i - 1, 0)); e.preventDefault() }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const target = highlightIndex >= 0 ? filtered[highlightIndex] : filtered[0]
      if (target) selectItem(target)
    } else if (e.key === 'Escape') { setOpen(false); setQuery(''); setHighlightIndex(-1); onSearchChange?.('') }
  }

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={displayValue}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => { setOpen(true); setQuery(''); setHighlightIndex(-1); onSearchChange?.('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHighlightIndex(0); onSearchChange?.(e.target.value) }}
        onKeyDown={handleKeyDown}
        className="w-full bg-card border border-border text-foreground text-sm rounded p-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
      {open && (
        <div ref={listRef} className="absolute z-50 w-full mt-1 bg-card border border-border rounded shadow-xl max-h-52 overflow-y-auto">
          {filtered.length === 0
            ? <div className="px-3 py-2 text-xs text-muted-foreground">No results</div>
            : filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-xs ${
                  i === highlightIndex ? 'bg-primary text-foreground' :
                  item.id === value ? 'text-primary bg-muted/50' : 'text-foreground hover:bg-muted'
                }`}
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={e => { e.preventDefault(); selectItem(item) }}
              >
                {item.label}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
