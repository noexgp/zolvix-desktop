interface Props { message: string; className?: string }

export default function ErrorBanner({ message, className = '' }: Props) {
  return (
    <div className={`text-xs text-destructive bg-destructive/20 border border-destructive/40 rounded px-3 py-2 ${className}`}>
      {message}
    </div>
  )
}
