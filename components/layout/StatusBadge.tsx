interface StatusBadgeProps {
  connected: boolean
  label?: string
  showLabel?: boolean
}

export function StatusBadge({
  connected,
  label,
  showLabel = false,
}: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full flex-shrink-0 ${
          connected
            ? "bg-[hsl(var(--success))]"
            : "bg-[hsl(var(--text-3))]"
        }`}
      />
      {showLabel && label && (
        <span className="text-xs text-[hsl(var(--text-3))]">{label}</span>
      )}
    </span>
  )
}
