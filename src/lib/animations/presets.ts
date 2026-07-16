/**
 * Framer Motion Animation Presets
 * ─────────────────────────────────
 * Centralized, reusable animation variants for the entire application.
 *
 * Usage:
 *   import { pageTransition, staggerContainer, staggerItem } from '@/lib/animations/presets'
 *   import { motion } from 'framer-motion'
 *
 *   <motion.div variants={pageTransition} initial="hidden" animate="visible">
 *     <motion.div variants={staggerContainer} initial="hidden" animate="visible">
 *       {items.map(item => (
 *         <motion.div key={item.id} variants={staggerItem}>{item.name}</motion.div>
 *       ))}
 *     </motion.div>
 *   </motion.div>
 */

// ── Shared easings ────────────────────────────────────────────────

export const easeOut = [0.16, 1, 0.3, 1] as const
export const easeIn = [0.4, 0, 1, 1] as const
export const easeInOut = [0.4, 0, 0.2, 1] as const

// ── Spring presets ────────────────────────────────────────────────

export const springGentle = { type: 'spring' as const, stiffness: 200, damping: 20 }
export const springSnappy = { type: 'spring' as const, stiffness: 400, damping: 30 }
export const springBouncy = { type: 'spring' as const, stiffness: 300, damping: 15 }

// ═══════════════════════════════════════════════════════════════════
// PAGE & ROUTE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Standard page enter animation.
 * Every page should use this as its wrapper animation.
 */
export const pageTransition = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: easeOut },
  },
}

/**
 * Faster page transition for sub-routes or modals acting as pages.
 */
export const pageTransitionFast = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: easeOut },
  },
}

// ═══════════════════════════════════════════════════════════════════
// STAGGERED LIST ENTRY
// ═══════════════════════════════════════════════════════════════════

/**
 * Parent container for staggered children.
 * Use with staggerItem for list entries.
 */
export const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
}

/**
 * Individual child item for staggered lists.
 */
export const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: easeOut },
  },
}

/**
 * Fast stagger for compact lists (tables, grids).
 */
export const staggerContainerFast = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
}

export const staggerItemFast = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easeOut },
  },
}

// ═══════════════════════════════════════════════════════════════════
// CARD ENTRANCE & HOVER
// ═══════════════════════════════════════════════════════════════════

/**
 * Card entry from below (used for StatCard grids, card lists).
 */
export const cardEntry = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: easeOut },
  }),
}

/**
 * Card hover lift effect.
 * Apply via whileHover on interactive cards.
 */
export const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: {
    scale: 1.02,
    y: -3,
    transition: springSnappy,
  },
  tap: { scale: 0.98 },
}

/**
 * Soft card hover effect (no scale, just shadow + slight lift).
 */
export const cardHoverSoft = {
  rest: { y: 0 },
  hover: {
    y: -2,
    transition: { duration: 0.2, ease: easeOut },
  },
  tap: { y: 0 },
}

// ═══════════════════════════════════════════════════════════════════
// BUTTON INTERACTIONS
// ═══════════════════════════════════════════════════════════════════

export const buttonTap = { scale: 0.97 }
export const buttonHover = { scale: 1.02 }

/**
 * Loading spinner rotation.
 */
export const spinnerRotate = {
  animate: {
    rotate: 360,
    transition: { repeat: Infinity, duration: 0.8, ease: 'linear' as const },
  },
}

// ═══════════════════════════════════════════════════════════════════
// TABLE & LIST ROWS
// ═══════════════════════════════════════════════════════════════════

/**
 * Table row entrance (slide in from left).
 */
export const tableRow = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, duration: 0.2, ease: easeOut },
  }),
}

/**
 * Table row hover highlight.
 */
export const tableRowHover = {
  rest: { backgroundColor: 'transparent' },
  hover: { backgroundColor: 'rgba(var(--color-muted), 0.5)' },
}

// ═══════════════════════════════════════════════════════════════════
// MODALS & OVERLAYS
// ═══════════════════════════════════════════════════════════════════

export const modalOverlay = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

export const modalContent = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springSnappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.15, ease: easeIn },
  },
}

// ═══════════════════════════════════════════════════════════════════
// DRAWERS (SLIDE PANELS)
// ═══════════════════════════════════════════════════════════════════

export const drawerSlideRight = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: springGentle,
  },
  exit: {
    x: '100%',
    transition: { duration: 0.2, ease: easeIn },
  },
}

export const drawerSlideLeft = {
  hidden: { x: '-100%' },
  visible: {
    x: 0,
    transition: springGentle,
  },
  exit: {
    x: '-100%',
    transition: { duration: 0.2, ease: easeIn },
  },
}

// ═══════════════════════════════════════════════════════════════════
// DROPDOWNS & POPOVERS
// ═══════════════════════════════════════════════════════════════════

export const dropdownOpen = {
  hidden: { opacity: 0, scale: 0.95, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.12, ease: easeOut },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -4,
    transition: { duration: 0.08, ease: easeIn },
  },
}

// ═══════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════

export const tabIndicator = {
  hidden: { width: 0, opacity: 0 },
  visible: {
    width: '100%',
    opacity: 1,
    transition: { duration: 0.2, ease: easeOut },
  },
}

export const tabContent = {
  enter: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: easeOut },
  },
  exit: {
    opacity: 0,
    x: -15,
    transition: { duration: 0.15, ease: easeIn },
  },
}

// ═══════════════════════════════════════════════════════════════════
// TOASTS
// ═══════════════════════════════════════════════════════════════════

export const toastEnter = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: 100 },
}

export const slideInRight = {
  hidden: { opacity: 0, x: 60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 },
  },
  exit: { opacity: 0, x: 60, transition: { duration: 0.15 } },
}

// ═══════════════════════════════════════════════════════════════════
// SKELETON → CONTENT REVEAL
// ═══════════════════════════════════════════════════════════════════

export const contentReveal = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, delay: 0.1 },
  },
}

// ═══════════════════════════════════════════════════════════════════
// FORM VALIDATION
// ═══════════════════════════════════════════════════════════════════

export const errorMessage = {
  hidden: { opacity: 0, y: -4, height: 0 },
  visible: {
    opacity: 1,
    y: 0,
    height: 'auto',
    transition: { duration: 0.2, ease: easeOut },
  },
  exit: {
    opacity: 0,
    y: -4,
    height: 0,
    transition: { duration: 0.15, ease: easeIn },
  },
}

export const validationIcon = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: easeOut },
  },
}

// ═══════════════════════════════════════════════════════════════════
// EMPTY STATES
// ═══════════════════════════════════════════════════════════════════

export const emptyStateEnter = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: easeOut },
  },
}

// ═══════════════════════════════════════════════════════════════════
// COUNTER / STAT VALUE ANIMATION
// ═══════════════════════════════════════════════════════════════════

export const counterEnter = {
  hidden: { scale: 0.5, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: springBouncy,
  },
}

// ═══════════════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════

export const progressBar = {
  hidden: { width: 0 },
  visible: (width: number) => ({
    width: `${width}%`,
    transition: { duration: 0.8, ease: easeOut },
  }),
}

// ═══════════════════════════════════════════════════════════════════
// CHART REVEAL
// ═══════════════════════════════════════════════════════════════════

export const chartReveal = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: easeOut, delay: 0.2 },
  },
}

export const chartScaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springGentle,
  },
}

// ═══════════════════════════════════════════════════════════════════
// PULSE INDICATORS (for live status, unread badges)
// ═══════════════════════════════════════════════════════════════════

export const pulseIndicator = {
  animate: {
    scale: [1, 1.1, 1],
    transition: { duration: 1.5, repeat: Infinity, ease: easeInOut },
  },
}

export const pingIndicator = {
  animate: {
    scale: [1, 1.3, 1],
    opacity: [0.7, 0, 0.7],
    transition: { duration: 1.5, repeat: Infinity, ease: easeInOut },
  },
}

// ═══════════════════════════════════════════════════════════════════
// ACCORDION / COLLAPSIBLE
// ═══════════════════════════════════════════════════════════════════

export const accordionContent = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.25, ease: easeOut },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.2, ease: easeIn },
  },
}

// ═══════════════════════════════════════════════════════════════════
// ICON BOUNCE
// ═══════════════════════════════════════════════════════════════════

export const iconBounce = {
  animate: {
    y: [0, -3, 0],
    transition: { duration: 1.5, repeat: Infinity, ease: easeInOut },
  },
}

export const iconWiggle = {
  animate: {
    rotate: [0, -10, 10, -10, 0],
    transition: { duration: 0.5, repeat: Infinity, repeatDelay: 3 },
  },
}

// ═══════════════════════════════════════════════════════════════════
// DEPRECATED — kept for backward compatibility with existing code
// ═══════════════════════════════════════════════════════════════════

/** @deprecated Use pageTransition instead */
export const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: easeOut },
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
}

/** @deprecated Use cardEntry instead */
export const statCard = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}
