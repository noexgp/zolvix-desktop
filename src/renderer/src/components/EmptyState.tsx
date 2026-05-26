interface Props { message?: string; className?: string }

export default function EmptyState({ message = 'No results found.', className = '' }: Props) {
  return (
    <div className={`flex items-center justify-center h-32 text-muted-foreground text-sm ${className}`}>
      {message}
    </div>
  )
}
