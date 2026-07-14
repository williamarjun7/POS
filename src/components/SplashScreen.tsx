import { motion, AnimatePresence } from 'framer-motion'

interface SplashScreenProps {
  isVisible: boolean
}

export function SplashScreen({ isVisible }: SplashScreenProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Subtle background gradient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-primary/6 to-transparent blur-3xl"
              animate={{
                x: [0, 20, -15, 0],
                y: [0, -20, 15, 0],
              }}
              transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-primary/4 to-transparent blur-3xl"
              animate={{
                x: [0, -25, 20, 0],
                y: [0, 25, -20, 0],
              }}
              transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Grid overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.012] dark:opacity-[0.025]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />

          {/* Center content */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            {/* Logo */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="relative"
            >
              <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-lg shadow-primary/5 ring-1 ring-border/50">
                <img
                  src="/favicon.png"
                  alt="Logo"
                  className="h-14 w-14 object-contain"
                  draggable={false}
                />
              </div>
              {/* Subtle glow behind logo */}
              <div className="absolute inset-0 -z-10 rounded-2xl bg-primary/5 blur-xl" />
            </motion.div>

            {/* Business name */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-1"
            >
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Highlands Cafe & Motel Inn
              </h1>
              <p className="text-sm text-muted-foreground">
                Highlands Cafe & Motel Inn
              </p>
            </motion.div>

            {/* Loading indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.3 }}
              className="mt-4 flex items-center gap-1.5"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-primary/40"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.8, 0.3] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </motion.div>
          </div>

          {/* Bottom gradient line */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
