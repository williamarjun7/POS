import { type ReactNode } from "react"
import { motion } from "framer-motion"

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
}

const containerReduced = {
  hidden: {},
  visible: { transition: { staggerChildren: 0, delayChildren: 0 } },
}

const itemReduced = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
}

function usePrefersReducedMotion() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

interface PageRevealProps {
  children: ReactNode
  className?: string
}

export function PageReveal({ children, className }: PageRevealProps) {
  const reduced = usePrefersReducedMotion()

  return (
    <motion.div
      variants={reduced ? containerReduced : container}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface PageRevealItemProps {
  children: ReactNode
  className?: string
}

export function PageRevealItem({ children, className }: PageRevealItemProps) {
  const reduced = usePrefersReducedMotion()

  return (
    <motion.div
      variants={reduced ? itemReduced : item}
      className={className}
    >
      {children}
    </motion.div>
  )
}
