import { lazy } from 'react';
import { DevScreen, devRoute } from '../../../prototype/dev-screen';

/** E.3 INV-006 is a developer-only, unit.view-gated read-only prototype. */
const UnitPriceHistoryPage = lazy(() => import('./UnitPriceHistoryPage'));
const PaymentPlanBuilderPage = lazy(() => import('./PaymentPlanBuilderPage'));
const PaymentPlanTemplatesPage = lazy(() => import('./PaymentPlanTemplatesPage'));
const PricingPoliciesPage = lazy(() => import('./PricingPoliciesPage'));
export const routes = [
  devRoute(
    'com/pricing-policies',
    <DevScreen page={PricingPoliciesPage} target={{ module: 'inventory', permission: 'pricing.manage' }} />,
    (t) => t('pricing:policyTitle'),
  ),
  devRoute(
    'com/payment-plan-templates',
    <DevScreen page={PaymentPlanTemplatesPage} target={{ module: 'inventory', permission: 'pricing.manage' }} />,
    (t) => t('pricing:templateTitle'),
  ),
  devRoute(
    'com/payment-plan-builder',
    <DevScreen page={PaymentPlanBuilderPage} target={{ module: 'inventory', permission: 'pricing.manage' }} />,
    (t) => t('pricing:previewTitle'),
  ),
  devRoute(
    'inv/unit-price-history',
    <DevScreen page={UnitPriceHistoryPage} target={{ module: 'inventory', permission: 'unit.view' }} />,
    (t) => t('pricing:title'),
  ),
];
