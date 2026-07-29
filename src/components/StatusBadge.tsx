import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

type Variant = "default" | "success" | "warning" | "destructive" | "info" | "secondary"

interface StatusBadgeProps {
  label: string
  variant?: Variant
  /** Optional Lucide icon to render before the label */
  icon?: ReactNode
  /** Compact size variant */
  size?: "sm" | "md"
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

export function StatusBadge({ label, variant = "default", icon, size = "md" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        containerStyles[variant],
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs"
      )}
    >
      {icon ? (
        <span className="shrink-0">{icon}</span>
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotStyles[variant])} />
      )}
      {label}
    </span>
  )
}
