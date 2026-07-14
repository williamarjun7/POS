import { cn } from "@/lib/utils"

type Variant = "default" | "success" | "warning" | "destructive" | "info" | "secondary"

interface StatusBadgeProps {
  label: string
  variant?: Variant
}

const variantStyles: Record<Variant, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-primary/10 text-primary",
  secondary: "bg-accent/10 text-accent-foreground",
}

export function StatusBadge({ label, variant = "default" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantStyles[variant]
      )}
    >
      {label}
    </span>
  )
}
