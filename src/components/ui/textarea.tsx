import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-22 w-full rounded-xl border border-transparent bg-deep px-4 py-3 text-sm leading-(--leading-body) text-ink outline-none transition-colors duration-(--duration-fast) ease-(--ease-out) placeholder:text-placeholder focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:2px] disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
