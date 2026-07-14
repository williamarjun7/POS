import { motion } from 'framer-motion'
import { Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/button'

interface SubmitButtonProps extends Omit<ButtonProps, 'loading'> {
  loading?: boolean
  loadingText?: string
}

export function SubmitButton({
  children,
  loading = false,
  loadingText,
  disabled,
  className,
  ...props
}: SubmitButtonProps) {
  return (
    <motion.div
      whileHover={{ scale: disabled || loading ? 1 : 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="group relative"
    >
      {/* Glow effect behind button */}
      <motion.div
        className="pointer-events-none absolute -inset-1 rounded-xl bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20 blur-md"
        animate={{
          opacity: loading ? 0.8 : 0,
        }}
        transition={{ duration: 0.3 }}
      />

      <Button
        disabled={disabled || loading}
        className={cn(
          'relative w-full h-12 overflow-hidden rounded-xl font-medium text-sm tracking-wide transition-all duration-200',
          'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground',
          'shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30',
          'hover:from-primary/95 hover:to-primary',
          'active:shadow-md active:shadow-primary/20',
          'disabled:shadow-none disabled:from-muted disabled:to-muted disabled:text-muted-foreground',
          loading && 'cursor-wait',
          className
        )}
        {...props}
      >
        {/* Loading overlay */}
        <motion.div
          initial={false}
          animate={{
            opacity: loading ? 1 : 0,
          }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/90"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
          >
            <Loader2 className="h-4 w-4 text-primary-foreground" />
          </motion.div>
          <span className="text-sm font-medium text-primary-foreground">
            {loadingText || 'Signing in...'}
          </span>
        </motion.div>

        {/* Default content */}
        <motion.span
          animate={{ opacity: loading ? 0 : 1 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center gap-2"
        >
          {children}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </motion.span>
      </Button>
    </motion.div>
  )
}
