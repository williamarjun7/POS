/**
 * Unified Card Component
 * ──────────────────────
 * Replaces both StatCard and SectionCard with a single, flexible API.
 *
 * Usage:
 *   <Card variant="stat" label="Revenue" value={5000} icon="DollarSign" />
 *   <Card variant="section" title="Details" icon="Info">content</Card>
 *   <Card variant="elevated" padding="lg">content</Card>
 */

import { type ReactNode, forwardRef } from 'react'
import { motion, type Variants, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/icon-mapper'
import { cardEntry } from '@/lib/animations/presets'

// ── Types ───────────────────────────────────────────────────────

type CardVariant = 'default' | 'elevated' | 'bordered' | 'flat'
type CardPadding = 'sm' | 'md' | 'lg'
type CardHover = 'none' | 'lift' | 'glow'

interface CardBaseProps {
  /** Visual variant */
  variant?: CardVariant
  /** Inner padding */
  padding?: CardPadding
  /** Hover interaction */
  hover?: CardHover
  /** Additional classes */
  className?: string
  /** Staggered entry index (omit for no entrance animation) */
  index?: number
  /** Animation variants override */
  animation?: Variants
  /** Children */
  children?: ReactNode
}

// ── Style Maps ──────────────────────────────────────────────────

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-card border border-border shadow-sm',
  elevated: 'bg-card border border-border shadow-md',
  bordered: 'bg-card border-2 border-primary shadow-sm',
  flat: 'bg-muted/30 border border-border',
}

const paddingStyles: Record<CardPadding, string> = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

const hoverStyles: Record<CardHover, string> = {
  none: '',
  lift: 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-foreground/20',
  glow: 'transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20',
}

// ── Base Card ──────────────────────────────────────────────────

export const Card = forwardRef<HTMLDivElement, CardBaseProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      hover = 'none',
      className,
      index,
      animation,
      children,
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion()
    const animate = animation && !shouldReduceMotion ? animation : undefined

    const content = (
      <div
        ref={ref}
        className={cn(
          'rounded-xl',
          variantStyles[variant],
          paddingStyles[padding],
          hoverStyles[hover],
          className
        )}
      >
        {children}
      </div>
    )

    if (animate) {
      return (
        <motion.div
          custom={index}
          variants={animate}
          initial="hidden"
          animate="visible"
        >
          {content}
        </motion.div>
      )
    }

    return content
  }
)
Card.displayName = 'Card'

// ── Stat Card variant ───────────────────────────────────────────

export interface StatCardProps {
  label: string
  value: string | number
  icon?: string
  /** Optional icon background color class */
  iconBg?: string
  /** Icon/text color */
  color?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  sublabel?: string
  children?: ReactNode
  className?: string
  index?: number
}

/**
 * KPI / Stat display card.
 * When iconBg or sublabel is provided, uses the "dashboard layout"
 * with larger stats and an icon container.
 */
export function StatCard({
  label,
  value,
  icon,
  iconBg,
  color = 'text-primary',
  trend,
  trendValue,
  sublabel,
  children,
  className,
  index = 0,
}: StatCardProps) {
  const isDashboardLayout = iconBg || sublabel

  return (
    <Card
      variant="default"
      padding="md"
      hover="lift"
      index={index}
      animation={cardEntry}
      className={className}
    >
      {isDashboardLayout ? (
        <>
          <div className="flex items-start justify-between">
            <div className="min-w-0 space-y-1.5">
              <p className="text-fine uppercase tracking-widest text-muted-foreground truncate">
                {label}
              </p>
              <p className="text-2xl font-bold tracking-tight truncate">
                {value}
              </p>
            </div>
            {icon && (
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  iconBg,
                  color
                )}
              >
                <Icon name={icon} className="h-5 w-5" />
              </div>
            )}
          </div>
          {sublabel && (
            <p className="mt-3 text-xs text-muted-foreground">{sublabel}</p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {icon && <Icon name={icon} className={cn('h-5 w-5', color)} />}
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        </>
      )}
      {trend && trendValue && (
        <p
          className={cn(
            'mt-1 text-xs font-medium',
            trend === 'up' && 'text-success',
            trend === 'down' && 'text-destructive',
            trend === 'neutral' && 'text-muted-foreground'
          )}
        >
          {trendValue}
        </p>
      )}
      {children}
    </Card>
  )
}

// ── Section Card variant ────────────────────────────────────────

export interface SectionCardProps {
  title: string
  icon?: string
  iconColor?: string
  children: ReactNode
  className?: string
  index?: number
}

/**
 * Card with a header row (title + optional icon).
 * Use for grouping content sections.
 */
export function SectionCard({
  title,
  icon,
  iconColor,
  children,
  className,
  index = 0,
}: SectionCardProps) {
  return (
    <Card
      variant="default"
      padding="md"
      index={index}
      animation={cardEntry}
      className={className}
    >
      {title && (
        <div className="mb-4 flex items-center gap-2">
          {icon && (
            <Icon
              name={icon}
              className={cn('h-5 w-5', iconColor ?? 'text-primary')}
            />
          )}
          <h3 className="text-section-title text-foreground">{title}</h3>
        </div>
      )}
      {children}
    </Card>
  )
}

// ── Re-export for backward compatibility ────────────────────────

/** @deprecated Import { Card } from '@/components/ui/card' instead */
export { Card as CardRoot }
