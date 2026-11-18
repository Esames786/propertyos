import { lazy } from 'react';
import { DevScreen, devRoute } from '../../../prototype/dev-screen';

/**
 * E.3 INV-006 is a developer-only, unit.view-gated read-only prototype.
 *
 * Wave 2 integration: a person of a served edition whom a screen's target refuses gets the Gate B access
 * outcome (`refusal="outcome"`, as E.2, E.7 and E.13 do), which says why in words and shows no data, not
 * the register's planned page. INV-007's drawer also needs `pricing.manage` to propose; without it the
 * drawer says so with the same reason words (EditPriceDrawerPage).
 */
const UnitPriceHistoryPage = lazy(() => import('./UnitPriceHistoryPage'));
const PaymentPlanBuilderPage = lazy(() => import('./PaymentPlanBuilderPage'));
const PaymentPlanTemplatesPage = lazy(() => import('./PaymentPlanTemplatesPage'));
const PricingPoliciesPage = lazy(() => import('./PricingPoliciesPage'));
const FeesDiscountsPage = lazy(() => import('./FeesDiscountsPage'));
const ApprovalRulesPage = lazy(() => import('./ApprovalRulesPage'));
const EditPriceDrawerPage = lazy(() => import('./EditPriceDrawerPage'));
export const routes = [
  devRoute(
    'inv/edit-price-drawer',
    <DevScreen page={EditPriceDrawerPage} target={{ module: 'inventory', permission: 'unit.view' }} refusal="outcome" />,
    (t) => t('pricing:priceChangeTitle'),
  ),
  devRoute(
    'com/approval-rules',
    <DevScreen page={ApprovalRulesPage} target={{ module: 'inventory', permission: 'pricing.manage' }} refusal="outcome" />,
    (t) => t('pricing:approvalTitle'),
  ),
  devRoute(
    'com/fees-and-discounts',
    <DevScreen page={FeesDiscountsPage} target={{ module: 'inventory', permission: 'pricing.manage' }} refusal="outcome" />,
    (t) => t('pricing:commercialTitle'),
  ),
  devRoute(
    'com/pricing-policies',
    <DevScreen page={PricingPoliciesPage} target={{ module: 'inventory', permission: 'pricing.manage' }} refusal="outcome" />,
    (t) => t('pricing:policyTitle'),
  ),
  devRoute(
    'com/payment-plan-templates',
    <DevScreen page={PaymentPlanTemplatesPage} target={{ module: 'inventory', permission: 'pricing.manage' }} refusal="outcome" />,
    (t) => t('pricing:templateTitle'),
  ),
  devRoute(
    'com/payment-plan-builder',
    <DevScreen page={PaymentPlanBuilderPage} target={{ module: 'inventory', permission: 'pricing.manage' }} refusal="outcome" />,
    (t) => t('pricing:previewTitle'),
  ),
  devRoute(
    'inv/unit-price-history',
    <DevScreen page={UnitPriceHistoryPage} target={{ module: 'inventory', permission: 'unit.view' }} refusal="outcome" />,
    (t) => t('pricing:title'),
  ),
];
