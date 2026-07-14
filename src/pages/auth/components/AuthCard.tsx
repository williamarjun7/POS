import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AuthCardProps {
  children: React.ReactNode
  className?: string
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/50 bg-card/95 backdrop-blur-sm p-6 sm:p-8',
        'shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]',
        'dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.12)]',
        'hover:shadow-[0_4px_16px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.06)]',
        'dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.25),0_12px_32px_rgba(0,0,0,0.15)]',
        'transition-shadow duration-300',
        className
      )}
    >
      {/* Subtle top gradient line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      {/* Subtle inner glow at top-left */}
      <div
        className="pointer-events-none absolute -top-20 -left-20 h-40 w-40 rounded-full bg-primary/[0.02] blur-2xl"
        aria-hidden="true"
      />

      {children}
    </motion.div>
  )
}
