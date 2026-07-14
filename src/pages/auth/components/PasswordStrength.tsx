import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { PasswordStrength } from '../types'

interface PasswordStrengthProps {
  strength: PasswordStrength
  showLabel?: boolean
}

const STRENGTH_CONFIG: Record<PasswordStrength, { label: string; color: string; width: string }> = {
  'weak': { label: 'Weak', color: 'bg-red-500', width: 'w-1/5' },
  'fair': { label: 'Fair', color: 'bg-orange-500', width: 'w-2/5' },
  'good': { label: 'Good', color: 'bg-yellow-500', width: 'w-3/5' },
  'strong': { label: 'Strong', color: 'bg-emerald-500', width: 'w-4/5' },
  'very-strong': { label: 'Very Strong', color: 'bg-emerald-600', width: 'w-full' },
}

export function PasswordStrength({ strength, showLabel = true }: PasswordStrengthProps) {
  const config = STRENGTH_CONFIG[strength]

  return (
    <div className="space-y-1">
      {/* Bar */}
      <div className="flex h-1 gap-0.5 overflow-hidden rounded-full">
        {['w-1/5', 'w-1/5', 'w-1/5', 'w-1/5', 'w-1/5'].map((_, i) => {
          const levels = ['weak', 'fair', 'good', 'strong', 'very-strong'] as const
          const isActive = levels.indexOf(strength) >= i
          return (
            <motion.div
              key={i}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{
                scaleX: isActive ? 1 : 0,
                opacity: isActive ? 1 : 0,
              }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className={cn(
                'h-full origin-left rounded-full transition-colors duration-300',
                isActive ? config.color : 'bg-muted'
              )}
            />
          )
        })}
      </div>

      {/* Label */}
      {showLabel && (
        <motion.p
          key={strength}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs text-muted-foreground"
        >
          Password strength: <span className="font-medium text-foreground">{config.label}</span>
        </motion.p>
      )}
    </div>
  )
}
