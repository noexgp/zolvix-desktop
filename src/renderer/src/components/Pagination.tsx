import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  page: number
  totalPages: number
  loading?: boolean
  onPageChange: (page: number) => void
}

export default function Pagination({ page, totalPages, loading, onPageChange }: Props) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-background">
      <Button
        size="sm" variant="outline" className="h-7 text-xs gap-1"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="w-3 h-3" /> Prev
      </Button>
      <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
      <Button
        size="sm" variant="outline" className="h-7 text-xs gap-1"
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(page + 1)}
      >
        Next <ChevronRight className="w-3 h-3" />
      </Button>
    </div>
  )
}
