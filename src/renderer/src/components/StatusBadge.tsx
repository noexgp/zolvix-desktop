import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  // invoice statuses
  pending:              'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  paid:                 'bg-green-500/15 text-green-700 dark:text-green-400',
  partial:              'bg-primary/15 text-primary',
  overdue:              'bg-destructive/15 text-destructive',
  // sales order statuses
  draft:                'bg-muted text-muted-foreground',
  pending_approval:     'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  approved:             'bg-green-500/15 text-green-700 dark:text-green-400',
  partially_delivered:  'bg-primary/15 text-primary',
  delivered:            'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
  invoiced:             'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  rejected:             'bg-destructive/15 text-destructive',
  cancelled:            'bg-destructive/15 text-destructive',
  void:                 'bg-muted text-muted-foreground',
}

interface Props {
  status: string
  voided?: boolean
  label?: string
  className?: string
}

export default function StatusBadge({ status, voided, label: labelProp, className }: Props) {
  const label = voided ? 'void' : (labelProp ?? status.replace(/_/g, ' '))
  const colorClass = voided ? 'bg-muted text-muted-foreground' : (STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground')
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium capitalize', colorClass, className)}>
      {label}
    </span>
  )
}
