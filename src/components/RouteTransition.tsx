import { type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useLocation } from "react-router-dom"

// Apple-inspired smooth easing: cubic-bezier(0.22, 1, 0.36, 1)
// Gentle deceleration curve that feels natural and premium
const easeApple = [0.22, 1, 0.36, 1] as const
const easeIn = [0.4, 0, 1, 1] as const

const variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: easeApple },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: 0.2, ease: easeIn },
  },
}

const reduced = {
  initial: { opacity: 1 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 1, transition: { duration: 0 } },
}

export function RouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const rm = useReducedMotion()

  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={location.pathname}
        variants={rm ? reduced : variants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
