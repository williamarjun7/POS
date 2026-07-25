import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const visible = open
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative bg-background border rounded-lg shadow-lg p-6 max-w-[min(28rem,calc(100vw-2rem))] w-full"
          >
            <div className="flex items-start gap-4">
              <div className={cn(
                "flex-shrink-0 p-2 rounded-full",
                variant === 'danger' && "bg-destructive/10 text-destructive",
                variant === 'warning' && "bg-warning/10 text-warning",
                variant === 'info' && "bg-info/10 text-info"
              )}>
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onCancel}
                disabled={loading}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md transition-all",
                  loading
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : "text-muted-foreground bg-muted hover:bg-muted/80"
                )}
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={cn(
                  "px-4 py-2 text-sm font-medium text-white rounded-md transition-all flex items-center gap-2",
                  variant === 'danger' && (loading ? "bg-destructive/60 cursor-not-allowed" : "bg-destructive hover:bg-destructive/90"),
                  variant === 'warning' && (loading ? "bg-warning/60 cursor-not-allowed" : "bg-warning hover:bg-warning/90 text-foreground"),
                  variant === 'info' && (loading ? "bg-info/60 cursor-not-allowed" : "bg-info hover:bg-info/90")
                )}
              >
                {loading && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {loading ? 'Deleting...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
