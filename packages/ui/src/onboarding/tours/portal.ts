import { Home, LifeBuoy } from 'lucide-react';
import type { TourDefinition } from '../tourTypes';

const k = (step: string, part: 'title' | 'body' | 'bodyMobile') => `portal:tour.${step}.${part}`;
const HOME = '/customer/portal/home';

/**
 * PORTAL-TOUR-001, the owner's first tour of the customer portal (Stage 1.5R). Offered on first sign-in
 * and replayable from the header help button. Every step spotlights a real element on the portal
 * home: the property hero, the next instalment and its pay / upload actions, quick actions,
 * receipts, construction progress, the navigation (side rail or phone bottom bar) and help.
 */
export const PORTAL_TOUR: TourDefinition = {
  id: 'PORTAL-TOUR-001',
  version: 1,
  app: 'customer',
  applicablePersonas: '*',
  nameKey: 'portal:tour.name',
  summaryKey: 'portal:tour.summary',
  steps: [
    { id: 'hero', kind: 'EXPLAIN', route: HOME, targetId: 'portal-hero', fallback: 'explain', art: { icon: Home, hue: 'emerald' }, titleKey: k('hero', 'title'), bodyKey: k('hero', 'body') },
    { id: 'nextInstalment', kind: 'EXPLAIN', route: HOME, targetId: 'portal-next-instalment', fallback: 'explain', titleKey: k('nextInstalment', 'title'), bodyKey: k('nextInstalment', 'body') },
    { id: 'payActions', kind: 'EXPLAIN', route: HOME, targetId: 'portal-pay-actions', fallback: 'explain', titleKey: k('payActions', 'title'), bodyKey: k('payActions', 'body') },
    { id: 'quickActions', kind: 'EXPLAIN', route: HOME, targetId: 'portal-quick-actions', fallback: 'skip', titleKey: k('quickActions', 'title'), bodyKey: k('quickActions', 'body') },
    { id: 'receipts', kind: 'EXPLAIN', route: HOME, targetId: 'portal-receipts', fallback: 'explain', titleKey: k('receipts', 'title'), bodyKey: k('receipts', 'body') },
    { id: 'construction', kind: 'EXPLAIN', route: HOME, targetId: 'portal-construction', fallback: 'explain', titleKey: k('construction', 'title'), bodyKey: k('construction', 'body') },
    {
      id: 'navigation',
      kind: 'EXPLAIN',
      route: HOME,
      targetId: 'portal-side-nav',
      mobileTargetId: 'portal-bottom-nav',
      fallback: 'explain',
      titleKey: k('navigation', 'title'),
      bodyKey: k('navigation', 'body'),
      mobileBodyKey: k('navigation', 'bodyMobile'),
    },
    { id: 'help', kind: 'EXPLAIN', route: HOME, targetId: 'portal-help', fallback: 'explain', art: { icon: LifeBuoy, hue: 'violet' }, titleKey: k('help', 'title'), bodyKey: k('help', 'body') },
  ],
};
