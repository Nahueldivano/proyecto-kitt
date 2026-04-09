import { cn } from "@/lib/utils"
import { InputHTMLAttributes, forwardRef } from "react"

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] focus-visible:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

Input.displayName = "Input"

export { Input }
