import { motion } from 'framer-motion'
import { useMemo } from 'react'

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  // Generate stable random positions for floating particles
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      delay: Math.random() * 8,
      duration: 12 + Math.random() * 20,
      opacity: 0.15 + Math.random() * 0.35,
    })),
  [])

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-background">
      {/* Animated gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <motion.div
          className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-primary/8 to-primary/3 blur-3xl"
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -30, 20, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-48 -left-48 h-[600px] w-[600px] rounded-full bg-gradient-to-tr from-primary/6 to-primary/2 blur-3xl"
          animate={{
            x: [0, -40, 30, 0],
            y: [0, 40, -30, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute top-1/3 left-1/4 h-[400px] w-[400px] rounded-full bg-gradient-to-r from-primary/4 via-primary/3 to-transparent blur-3xl"
          animate={{
            x: [0, 50, -30, 0],
            y: [0, -20, 40, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
        aria-hidden="true"
      />

      {/* Floating particles */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-primary/20 dark:bg-primary/30"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
            }}
            animate={{
              y: [0, -30, 0, 20, 0],
              x: [0, 15, -10, 5, 0],
              opacity: [0, p.opacity, p.opacity * 0.5, p.opacity, 0],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Bottom gradient edge glow */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent"
        aria-hidden="true"
      />

      {/* Main content */}
      <div className="relative z-10 flex w-full items-center justify-center p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-[420px]"
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}
