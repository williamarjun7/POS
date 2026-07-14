import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft, Search } from 'lucide-react'

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        {/* Animated 404 graphic */}
        <motion.div
          className="relative mx-auto mb-8"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        >
          <div className="relative">
            <div className="text-[120px] font-black leading-none tracking-tighter text-foreground/5 select-none">
              404
            </div>
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-3">
                  <motion.span
                    className="text-6xl font-black text-emerald-500"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    4
                  </motion.span>
                  <motion.div
                    className="relative"
                    animate={{ rotate: [0, -10, 10, -5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                      <Search className="h-7 w-7 text-white" />
                    </div>
                  </motion.div>
                  <motion.span
                    className="text-6xl font-black text-emerald-500"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  >
                    4
                  </motion.span>
                </div>
                <motion.p
                  className="mt-4 text-lg font-semibold text-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  Page Not Found
                </motion.p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Description */}
        <motion.p
          className="mb-8 text-muted-foreground"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          The page you're looking for doesn't exist or has been moved.
          Check the URL or head back to a known destination.
        </motion.p>

        {/* Actions */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <button
            onClick={() => navigate(-1)}
            className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold transition-all hover:bg-muted active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            Back to Dashboard
          </button>
        </motion.div>

        {/* Footer hint */}
        <motion.p
          className="mt-8 text-xs text-muted-foreground/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          Looking for something specific? Try using the sidebar navigation.
        </motion.p>
      </div>
    </div>
  )
}
