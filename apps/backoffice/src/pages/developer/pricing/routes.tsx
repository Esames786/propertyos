import { lazy } from 'react';
import { DevScreen, devRoute } from '../../../prototype/dev-screen';

/** E.3 INV-006 is a developer-only, unit.view-gated read-only prototype. */
const UnitPriceHistoryPage = lazy(() => import('./UnitPriceHistoryPage'));
const PaymentPlanBuilderPage = lazy(() => import('./PaymentPlanBuilderPage'));
const PaymentPlanTemplatesPage = lazy(() => import('./PaymentPlanTemplatesPage'));
const PricingPoliciesPage = lazy(() => import('./PricingPoliciesPage'));
const FeesDiscountsPage = lazy(() => import('./FeesDiscountsPage'));
const ApprovalRulesPage = lazy(() => import('./ApprovalRulesPage'));
export const routes = [
  devRoute(
    'com/approval-rules',
    <DevScreen page={ApprovalRulesPage} target={{ module: 'inventory', permission: 'pricing.manage' }} />,
    (t) => t('pricing:approvalTitle'),
  ),
  devRoute(
    'com/fees-and-discounts',
    <DevScreen page={FeesDiscountsPage} target={{ module: 'inventory', permission: 'pricing.manage' }} />,
    (t) => t('pricing:commercialTitle'),
  ),
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
