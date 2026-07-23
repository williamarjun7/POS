import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

// ═══════════════════════════════════════════════════════════════
//  SMALL BUTTON  —  Card-level action buttons
//  Variants: primary | success | danger | ghost
//  Size:     36px min-height, text-xs, rounded-lg
// ═══════════════════════════════════════════════════════════════

const smallButtonStyles: Record<string, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/10",
  success: "bg-emerald-500 text-white hover:bg-emerald-500/90 shadow-sm shadow-emerald-500/10",
  danger:  "bg-red-500 text-white hover:bg-red-500/90 shadow-sm shadow-red-500/10",
  ghost:   "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
}

export interface SmallButtonProps {
  icon?: React.ElementType
  label: string
  onClick: () => void
  variant?: "primary" | "success" | "danger" | "ghost"
  disabled?: boolean
  /** Hide label on mobile — only show icon (default: true) */
  responsiveLabel?: boolean
  className?: string
}

export const SmallButton = React.forwardRef<HTMLButtonElement, SmallButtonProps>(
  ({ icon: Icon, label, onClick, variant = "primary", disabled, responsiveLabel = true, className }, ref) => (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold whitespace-nowrap min-h-[36px] transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
        smallButtonStyles[variant],
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {responsiveLabel ? <span className="hidden sm:inline">{label}</span> : label}
    </motion.button>
  ),
)
SmallButton.displayName = "SmallButton"

// ═══════════════════════════════════════════════════════════════
//  DIALOG BUTTON  —  Dialog footer action buttons
//  Variants: primary (filled bg) | secondary (bordered) | danger (red)
//  Size:     40px min-height, text-sm, rounded-xl
// ═══════════════════════════════════════════════════════════════

const dialogButtonStyles = {
  primary: "bg-primary text-white shadow-sm hover:bg-primary/90",
  secondary:
    "border border-border text-muted-foreground hover:bg-muted",
  danger:
    "bg-red-500 text-white shadow-sm hover:bg-red-500/90",
}

export interface DialogButtonProps {
  label: string
  onClick: () => void
  variant?: "primary" | "secondary" | "danger"
  disabled?: boolean
  loading?: boolean
  loadingText?: string
  icon?: React.ElementType
  className?: string
}

export const DialogButton = React.forwardRef<HTMLButtonElement, DialogButtonProps>(
  ({ label, onClick, variant = "primary", disabled, loading, loadingText, icon: Icon, className }, ref) => (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap min-h-[40px]",
        variant === "primary" && !disabled && !loading
          ? dialogButtonStyles.primary
          : variant === "danger" && !disabled && !loading
            ? dialogButtonStyles.danger
            : dialogButtonStyles.secondary,
        variant === "primary" && !disabled && !loading && "font-bold",
        variant === "danger" && !disabled && !loading && "font-bold",
        className,
      )}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          {loadingText || `${label}...`}
        </>
      ) : (
        <>
          {Icon && <Icon className="h-4 w-4 shrink-0" />}
          {label}
        </>
      )}
    </motion.button>
  ),
)
DialogButton.displayName = "DialogButton"
