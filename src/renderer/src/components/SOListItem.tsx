import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  draft:               'bg-muted text-muted-foreground',
  pending_approval:    'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  approved:            'bg-green-500/15 text-green-700 dark:text-green-400',
  partially_delivered: 'bg-primary/15 text-primary',
  delivered:           'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
  invoiced:            'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  rejected:            'bg-destructive/15 text-destructive',
}

const STATUS_LABELS: Record<string, string> = {
  draft:               'Draft',
  pending_approval:    'Pending',
  approved:            'Approved',
  partially_delivered: 'Part. Del.',
  delivered:           'Delivered',
  invoiced:            'Invoiced',
  rejected:            'Rejected',
}

interface SOListItemProps {
  so: {
    id: string
    soNumber: string
    status: string
    customerName?: string
    orderDate: string
    totalAmount: number
  }
  selected: boolean
  onClick: () => void
}

export default function SOListItem({ so, selected, onClick }: SOListItemProps) {
  const formattedDate = new Date(so.orderDate).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const formattedAmount = Number(so.totalAmount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={cn(
        'px-3 py-3 cursor-pointer border-b border-border transition-colors duration-100',
        selected
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-accent/50'
      )}
    >
      <div className="flex justify-between items-center gap-2">
        <span className="text-sm font-semibold text-primary truncate">{so.soNumber}</span>
        <span
          className={cn(
            'text-[11px] px-1.5 py-0.5 rounded font-medium shrink-0',
            STATUS_COLORS[so.status] ?? 'bg-muted text-muted-foreground'
          )}
        >
          {STATUS_LABELS[so.status] ?? so.status}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-1 truncate">{so.customerName ?? '—'}</div>
      <div className="flex justify-between items-center mt-1">
        <span className="text-xs text-muted-foreground">{formattedDate}</span>
        <span className="text-xs font-medium text-foreground">₱{formattedAmount}</span>
      </div>
    </div>
  )
}
