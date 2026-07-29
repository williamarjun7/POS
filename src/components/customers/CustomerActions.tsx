/**
 * CustomerActions — Quick action buttons for customer table rows
 * ──────────────────────────────────────────────────────────────
 *
 * Desktop: appears on row hover
 * Mobile: accessible via long press or tap
 */

import { motion } from "framer-motion"
import { ShoppingBag, CreditCard, Eye, Printer } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CustomerActionsProps {
  customerName: string
  hasOutstanding: boolean
  onViewProfile: () => void
  onNewSale: () => void
  onReceivePayment: () => void
  onPrintLastInvoice?: () => void
  /** Show actions always (for mobile) or only on hover (desktop) */
  alwaysVisible?: boolean
}

export function CustomerActions({
  customerName,
  hasOutstanding,
  onViewProfile,
  onNewSale,
  onReceivePayment,
  onPrintLastInvoice,
  alwaysVisible = false,
}: CustomerActionsProps) {
  const buttons = [
    {
      icon: Eye,
      label: "View",
      onClick: onViewProfile,
      color: "text-primary hover:bg-primary/10",
    },
    {
      icon: ShoppingBag,
      label: "Sale",
      onClick: onNewSale,
      color: "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20",
    },
    {
      icon: CreditCard,
      label: "Pay",
      onClick: onReceivePayment,
      color: hasOutstanding
        ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
        : "text-muted-foreground hover:bg-muted",
    },
    ...(onPrintLastInvoice
      ? [{
          icon: Printer,
          label: "Print",
          onClick: onPrintLastInvoice,
          color: "text-muted-foreground hover:bg-muted",
        }]
      : []),
  ]

  if (alwaysVisible) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {buttons.map((btn) => (
          <motion.button
            key={btn.label}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={btn.onClick}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              btn.color,
            )}
            title={btn.label}
            aria-label={`${btn.label} — ${customerName}`}
          >
            <btn.icon className="h-4 w-4" />
          </motion.button>
        ))}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      {buttons.map((btn) => (
        <motion.button
          key={btn.label}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={btn.onClick}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            btn.color,
          )}
          title={btn.label}
          aria-label={`${btn.label} — ${customerName}`}
        >
          <btn.icon className="h-3.5 w-3.5" />
        </motion.button>
      ))}
    </motion.div>
  )
}
