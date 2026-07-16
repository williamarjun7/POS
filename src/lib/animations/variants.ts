/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  DEPRECATED — Use @/lib/animations/presets instead              ║
 * ║  This file re-exports all animation variants from the canonical  ║
 * ║  presets library for backward compatibility with existing code.  ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

export {
  // page transitions
  pageTransition,
  pageTransitionFast,
  // stagger
  staggerContainer,
  staggerItem,
  staggerContainerFast,
  staggerItemFast,
  // cards
  cardEntry,
  cardHover,
  cardHoverSoft,
  // tables
  tableRow,
  tableRowHover,
  // modals
  modalOverlay,
  modalContent,
  // drawers
  drawerSlideRight,
  drawerSlideLeft,
  // dropdowns
  dropdownOpen,
  // tabs
  tabContent,
  tabIndicator,
  // toasts
  toastEnter,
  // content
  contentReveal,
  emptyStateEnter,
  // forms
  errorMessage,
  validationIcon,
  // charts
  chartReveal,
  chartScaleIn,
  // interaction
  buttonTap,
  buttonHover,
  spinnerRotate,
  accordionContent,
  // indicators
  pulseIndicator,
  pingIndicator,
  iconBounce,
  iconWiggle,
  // easings (re-exported)
  easeOut,
  easeIn,
  easeInOut,
  springGentle,
  springSnappy,
  springBouncy,
} from './presets'

/** @deprecated Use pageTransition instead */
export { fadeInUp, statCard } from './presets'

/** @deprecated Use pageTransitionFast instead */
export const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
}

/** @deprecated Use pageTransitionFast instead */
export const slideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
}

/** @deprecated Use slideInRight from presets instead */
export const slideRight = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.2 } },
}

/** @deprecated Use modalContent from presets instead */
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: 'easeOut' as const } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
}

/** @deprecated Use tableRow from presets instead */
export const listItem = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
}
