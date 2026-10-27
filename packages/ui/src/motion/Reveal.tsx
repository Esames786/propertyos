import { motion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';
import { useReducedMotion } from '../preferences/PreferencesProvider';

const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0.18, duration: 0.5 } },
};

/**
 * Staggered entrance for a group of cards (opacity + a 10 px rise, transform only). Under reduced
 * motion everything renders in place immediately. Content is never hidden from assistive tech.
 */
export function Stagger({
  children,
  className,
  as = 'div',
  label,
  testId,
  tourId,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'ol';
  /** Accessible name for the group (e.g. a list of figures). */
  label?: string;
  testId?: string;
  tourId?: string;
}) {
  const reduced = useReducedMotion();
  const Tag = as === 'ul' ? motion.ul : as === 'ol' ? motion.ol : motion.div;
  return (
    <Tag
      className={className}
      aria-label={label}
      data-testid={testId}
      data-tour-id={tourId}
      variants={container}
      initial={reduced ? false : 'hidden'}
      animate="shown"
    >
      {children}
    </Tag>
  );
}

export function RevealItem({ children, className, as = 'div', tourId }: { children: ReactNode; className?: string; as?: 'div' | 'li'; tourId?: string }) {
  const reduced = useReducedMotion();
  const Tag = as === 'li' ? motion.li : motion.div;
  return (
    <Tag className={className} data-tour-id={tourId} variants={reduced ? undefined : item}>
      {children}
    </Tag>
  );
}

/** Route-level entrance: the page settles into place when the path changes. */
export function PageEnter({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      key={id}
      className={className}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.12, duration: 0.45 }}
    >
      {children}
    </motion.div>
  );
}
