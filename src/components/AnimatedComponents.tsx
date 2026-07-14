import { motion, type Variants } from 'framer-motion';
import { fadeInUp, staggerContainer, staggerItem } from '../lib/animations/presets';

interface AnimatedContainerProps {
  children: React.ReactNode;
  animation?: Variants;
  delay?: number;
  duration?: number;
  className?: string;
  once?: boolean;
}

export function AnimatedContainer({
  children,
  animation = fadeInUp,
  delay = 0,
  duration = 0.35,
  className,
  once = true,
}: AnimatedContainerProps) {
  return (
    <motion.div
      variants={animation}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '-40px' }}
      transition={{ duration, delay, ease: 'easeOut' as const }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-20px' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}
