import { HandCoins, LifeBuoy } from 'lucide-react';
import type { TourDefinition } from '../tourTypes';

const k = (step: string, part: 'title' | 'body' | 'bodyMobile') => `dues:tour.${step}.${part}`;
const HOME = '/customer/portal/home';

/**
 * GUIDE-009, the resident dues tour (Gate C.2). Offered to a society resident after the text-size
 * step on first sign-in, replayable from the header help button. Every step frames a real element of
 * the dues home: this month's bill, the exact total, how to pay, proof status, receipts and the
 * statement, the navigation and help. Its guided step completes on the real action (opening "Pay").
 */
export const DUES_TOUR: TourDefinition = {
  id: 'DUES-TOUR-001',
  version: 1,
  app: 'customer',
  applicablePersonas: ['alnoor_resident_a101', 'alnoor_tenant_a102', 'alnoor_owner_a201', 'alnoor_tenant_a202'],
  nameKey: 'dues:tour.name',
  summaryKey: 'dues:tour.summary',
  steps: [
    { id: 'bill', kind: 'EXPLAIN', route: HOME, targetId: 'dues-bill', fallback: 'explain', art: { icon: HandCoins, hue: 'emerald' }, titleKey: k('bill', 'title'), bodyKey: k('bill', 'body') },
    { id: 'total', kind: 'EXPLAIN', route: HOME, targetId: 'dues-total', fallback: 'explain', titleKey: k('total', 'title'), bodyKey: k('total', 'body') },
    { id: 'pay', kind: 'GUIDED_ACTION', optional: true, route: HOME, targetId: 'dues-pay', fallback: 'explain', completionEvent: 'dues.pay.opened', titleKey: k('pay', 'title'), bodyKey: k('pay', 'body') },
    { id: 'status', kind: 'EXPLAIN', route: HOME, targetId: 'dues-activity', fallback: 'explain', titleKey: k('status', 'title'), bodyKey: k('status', 'body') },
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
