import { type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface BaseModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  /**
   * xs  = max-w-sm (320px) – short confirms, alerts
   * sm  = max-w-sm (384px) – short forms
   * md  = max-w-md (448px) – DEFAULT, most forms
   * lg  = max-w-lg (512px) – detail views
   * xl  = max-w-2xl (672px) – complex modals
   * full = max-w-[90vw] – full-width (rare)
   */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "full"
}

const sizeClasses = {
  xs: "max-w-[min(20rem,calc(100vw-2rem))]",
  sm: "max-w-[min(24rem,calc(100vw-2rem))]",
  md: "max-w-[min(28rem,calc(100vw-2rem))]",
  lg: "max-w-[min(32rem,calc(100vw-2rem))]",
  xl: "max-w-[min(42rem,calc(100vw-2rem))]",
  full: "max-w-[90vw]",
}

export function BaseModal({ open, onClose, title, children, footer, className, size = "md" }: BaseModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "w-full rounded-xl border bg-card shadow-xl flex flex-col max-h-[85vh]",
              sizeClasses[size],
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="shrink-0 border-t border-border px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
