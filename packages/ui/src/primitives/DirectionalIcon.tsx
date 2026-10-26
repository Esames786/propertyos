import type { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Icons that express direction (chevrons, arrows, "next") mirror in RTL. Logos, photos, charts,
 * phone numbers and non-directional icons must never use this.
 */
export function DirectionalIcon({ icon: Icon, className, ...props }: LucideProps & { icon: LucideIcon }) {
  return <Icon aria-hidden {...props} className={cn('rtl:-scale-x-100', className)} />;
}
