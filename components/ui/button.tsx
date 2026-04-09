import { cn } from "@/lib/utils"
import { ButtonHTMLAttributes, forwardRef } from "react"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary"
  size?: "sm" | "md" | "lg" | "icon"
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer touch-manipulation"

    const variants = {
      default:
        "bg-[hsl(var(--accent))] text-white hover:bg-[hsl(var(--accent-hover))]",
      outline:
        "border border-[hsl(var(--border-2))] bg-transparent text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))]",
      ghost:
        "bg-transparent text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]",
      destructive:
        "bg-[hsl(var(--destructive))] text-white hover:opacity-90",
      secondary:
        "bg-[hsl(var(--surface-2))] text-[hsl(var(--text))] hover:bg-[hsl(var(--border-2))]",
    }

    const sizes = {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4 text-sm",
      lg: "h-11 px-6 text-base",
      icon: "h-9 w-9",
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : null}
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"

export { Button }
