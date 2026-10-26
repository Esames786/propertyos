import type { NavItem } from '@repo/ui';
import { Building, CreditCard, House, LifeBuoy, UserRound } from 'lucide-react';

/** Customer bottom navigation (blueprint 01 §5): Home | Property | Payments | Services | Profile. */
export const CUSTOMER_NAV: NavItem[] = [
  { id: 'home', labelKey: 'nav:customer.home', href: '/customer/portal/home', icon: House, match: '/customer/portal/home' },
  { id: 'property', labelKey: 'nav:customer.property', href: '/customer/portal/my-properties', icon: Building, match: '/customer/portal/my-properties' },
  { id: 'payments', labelKey: 'nav:customer.payments', href: '/customer/portal/payments-dashboard', icon: CreditCard, match: '/customer/portal/payments-dashboard' },
  { id: 'services', labelKey: 'nav:customer.services', href: '/customer/portal/services-home', icon: LifeBuoy, match: '/customer/portal/services-home' },
  { id: 'profile', labelKey: 'nav:customer.profile', href: '/customer/portal/profile', icon: UserRound, match: '/customer/portal/profile' },
];

export const START = '/customer/portal/lab';
