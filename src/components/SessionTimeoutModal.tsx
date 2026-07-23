import { motion, AnimatePresence } from 'framer-motion'
import { Clock, LogOut, Activity } from 'lucide-react'

interface SessionTimeoutModalProps {
  show: boolean
  timeLeft: number
  onDismiss: () => void
  onLogout: () => void
}

export function SessionTimeoutModal({ show, timeLeft, onDismiss, onLogout }: SessionTimeoutModalProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onDismiss} />
          <motion.div
            className="relative w-full max-w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card shadow-2xl p-6"
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
                <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Session Expiring Soon</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your session will expire due to inactivity.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 dark:bg-amber-900/30 px-4 py-1.5">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {timeLeft > 60
                    ? `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s`
                    : `${timeLeft}s`}
                </span>
                <span className="text-xs text-amber-600/70 dark:text-amber-300/70">remaining</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={onDismiss}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
              >
                <Activity className="h-4 w-4" />
                I'm still here — Stay logged in
              </button>
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-all active:scale-[0.98]"
              >
                <LogOut className="h-4 w-4" />
                Log out now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
