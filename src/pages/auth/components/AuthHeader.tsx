import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import logoSrc from '@/assets/logo.png'

interface AuthHeaderProps {
  title: string
  subtitle?: string
  className?: string
}

export function AuthHeader({ title, subtitle, className }: AuthHeaderProps) {

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn('mb-8 text-center', className)}
    >
      {/* Logo with hover pulse */}
      <div className="mb-5 flex justify-center">
        <div className="group relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20 ring-4 ring-primary/10 overflow-hidden transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-primary/30 group-hover:animate-pulse-soft">
          <img
            src={logoSrc}
            alt="Highlands Cafe & Motel Inn"
            className="h-full w-full rounded-2xl object-cover transition-transform duration-300 group-hover:scale-110"
          />
        </div>
      </div>

      {/* Business name */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mb-1 text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground/70"
      >
        Highlands Cafe & Motel Inn
      </motion.p>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
      >
        {title}
      </motion.h1>

      {/* Subtitle */}
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto"
        >
          {subtitle}
        </motion.p>
      )}
    </motion.div>
  )
}
