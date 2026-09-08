import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        /* Filled, borderless, and focused with the brand orange — the rule the
           routine sheet settled on, now the rule everywhere. */
        "h-11 w-full min-w-0 rounded-xl border border-transparent bg-deep px-4 py-1 text-sm text-ink outline-none transition-colors duration-(--duration-fast) ease-(--ease-out) file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-placeholder focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:2px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:[outline:2px_solid_var(--destructive)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
