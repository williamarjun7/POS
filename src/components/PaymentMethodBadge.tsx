/**
 * PaymentMethodBadge
 * ──────────────────
 * Reusable component for displaying payment methods with method-specific icons,
 * colors, and labels. Supports single-method and multi-method display.
 *
 * Usage:
 *   <PaymentMethodBadge method="cash" />
 *   <PaymentMethodBadge method="reception_qr" size="sm" />
 *   <PaymentMethodBadge method="fonepay" showIcon={false} />
 *   <PaymentMethodBadge multi={['cash', 'fonepay']} />
 */

import { Banknote, Smartphone, CreditCard, QrCode, type LucideIcon } from 'lucide-react'
import { getPaymentMethodLabel, getPaymentMethodColor } from '@/lib/payment-methods'
import { cn } from '@/lib/utils'

// ─── Icon map ───────────────────────────────────────────────

const METHOD_ICONS: Record<string, LucideIcon> = {
  cash: Banknote,
  reception_qr: Smartphone,
  fonepay: QrCode,
  credit: CreditCard,
}

// ─── Size styles ────────────────────────────────────────────

const SIZE_STYLES = {
  sm: {
    wrapper: 'gap-1',
    icon: 'h-3 w-3',
    label: 'text-[11px]',
    badge: 'px-1.5 py-0.5',
  },
  md: {
    wrapper: 'gap-1.5',
    icon: 'h-3.5 w-3.5',
    label: 'text-xs',
    badge: 'px-2 py-0.5',
  },
  lg: {
    wrapper: 'gap-2',
    icon: 'h-4 w-4',
    label: 'text-sm',
    badge: 'px-2.5 py-1',
  },
} as const

// ─── Props ──────────────────────────────────────────────────

export interface PaymentMethodBadgeProps {
  /** DB key of the payment method (e.g. 'cash', 'reception_qr', 'fonepay', 'credit') */
  method?: string | null
  /** Display size */
  size?: keyof typeof SIZE_STYLES
  /** Show the method icon */
  showIcon?: boolean
  /** Show the method label */
  showLabel?: boolean
  /** Optional: show only the colored dot (compact table display) */
  dotOnly?: boolean
  /** Multiple methods (for split/multi-method payments) — overrides `method` */
  multi?: string[]
  /** Max methods to show before "+X more" truncation (only with `multi`) */
  multiMax?: number
  /** Additional classes */
  className?: string
}

// ─── Component ──────────────────────────────────────────────

export function PaymentMethodBadge({
  method,
  size = 'md',
  showIcon = true,
  showLabel = true,
  dotOnly = false,
  multi,
  multiMax = 2,
  className,
}: PaymentMethodBadgeProps) {
  const s = SIZE_STYLES[size]

  // ── Multi-method display ────────────────────────────────
  if (multi && multi.length > 0) {
    const displayMethods = multi.slice(0, multiMax)
    const remaining = multi.length - multiMax

    return (
      <span className={cn('inline-flex items-center flex-wrap gap-1', className)}>
        {displayMethods.map((m) => {
          const Icon = METHOD_ICONS[m]
          return (
            <span
              key={m}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5',
                s.badge,
              )}
              style={{ borderColor: `${getPaymentMethodColor(m)}40` }}
            >
              {showIcon && Icon && (
                <Icon className={cn(s.icon, 'shrink-0')} style={{ color: getPaymentMethodColor(m) }} />
              )}
              {showLabel && (
                <span className={cn(s.label, 'font-medium')}>
                  {getPaymentMethodLabel(m)}
                </span>
              )}
            </span>
          )
        })}
        {remaining > 0 && (
          <span
            className={cn(s.label, 'text-muted-foreground cursor-default')}
            title={multi.slice(multiMax).map(getPaymentMethodLabel).join(', ')}
          >
            +{remaining} more
          </span>
        )}
      </span>
    )
  }

  const resolvedMethod = method ?? 'unknown'
  const color = getPaymentMethodColor(resolvedMethod)
  const label = getPaymentMethodLabel(resolvedMethod)
  const Icon = METHOD_ICONS[resolvedMethod]

  // ── Dot-only (compact table variant) ────────────────────
  if (dotOnly) {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5', className)}
        title={label}
      >
        <span
          className="inline-block rounded-full shrink-0"
          style={{ backgroundColor: color, width: size === 'sm' ? 6 : 8, height: size === 'sm' ? 6 : 8 }}
        />
        {showLabel && <span className={cn(s.label, 'text-muted-foreground')}>{label}</span>}
      </span>
    )
  }

  // ── Full badge ──────────────────────────────────────────
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium transition-colors',
        s.wrapper,
        className,
      )}
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}08`,
      }}
    >
      {showIcon && Icon && (
        <Icon className={cn(s.icon, 'shrink-0')} style={{ color }} />
      )}
      {showLabel && (
        <span className={cn(s.label)} style={{ color }}>
          {label}
        </span>
      )}
    </span>
  )
}
