import { cn } from "@/lib/utils"

type Variant = "default" | "success" | "warning" | "destructive" | "info" | "secondary"

interface StatusBadgeProps {
  label: string
  variant?: Variant
}

const containerStyles: Record<Variant, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-primary/10 text-primary",
  secondary: "bg-accent/10 text-accent-foreground",
}

const dotStyles: Record<Variant, string> = {
  default: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-primary",
  secondary: "bg-accent-foreground",
}

export function StatusBadge({ label, variant = "default" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        containerStyles[variant]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotStyles[variant])} />
      {label}
    </span>
  )
}
