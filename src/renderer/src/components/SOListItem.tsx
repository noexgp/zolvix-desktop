import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  draft:               'text-slate-400 bg-slate-800',
  pending_approval:    'text-amber-400 bg-amber-900/30',
  approved:            'text-green-400 bg-green-900/30',
  partially_delivered: 'text-blue-400 bg-blue-900/30',
  delivered:           'text-indigo-400 bg-indigo-900/30',
  invoiced:            'text-purple-400 bg-purple-900/30',
  rejected:            'text-red-400 bg-red-900/30',
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
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={cn(
        'px-3 py-2.5 cursor-pointer border-b border-slate-800 hover:bg-slate-800/60',
        selected && 'bg-blue-950/60 border-l-2 border-l-blue-500'
      )}
    >
      <div className="flex justify-between items-center">
        <span className="text-white text-xs font-semibold">{so.soNumber}</span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[so.status] ?? 'text-slate-400 bg-slate-800')}>
          {STATUS_LABELS[so.status] ?? so.status}
        </span>
      </div>
      <div className="text-slate-400 text-[11px] mt-0.5 truncate">{so.customerName ?? '—'}</div>
      <div className="flex justify-between mt-0.5">
        <span className="text-slate-500 text-[10px]">{new Date(so.orderDate).toLocaleDateString('en-PH')}</span>
        <span className="text-slate-300 text-[10px]">₱{Number(so.totalAmount).toLocaleString()}</span>
      </div>
    </div>
  )
}
